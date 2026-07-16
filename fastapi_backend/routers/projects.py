import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from db import get_pool
from services.email_service import send_email

router = APIRouter(prefix="/api/projects", tags=["Projects"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://pomar.ai")

INVITE_ROLES = ("contributor", "viewer")


class CreateProjectRequest(BaseModel):
    userId: int
    name: str
    project_number: Optional[str] = None
    client_name: Optional[str] = None


class InviteRequest(BaseModel):
    invitedBy: int
    email: str
    role: str = "contributor"


@router.get("")
async def get_projects(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT p.id, p.name, p.project_number, p.client_name, pm.role AS member_role
               FROM projects p
               JOIN project_members pm ON pm.project_id = p.id
               WHERE pm.user_id = $1
               ORDER BY p.created_at""",
            userId,
        )
    return {"success": True, "projects": [dict(r) for r in rows]}


@router.post("")
async def create_project(req: CreateProjectRequest):
    if not req.name or not req.name.strip():
        raise HTTPException(400, "Project name is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT company_id, permission_level FROM users WHERE id = $1", req.userId
        )
        if not user:
            raise HTTPException(404, "User not found")
        if user["permission_level"] != "owner":
            raise HTTPException(
                403,
                "Only the company owner can create projects. "
                "Ask your company owner to create the project and invite you.",
            )

        company_id = user["company_id"]

        async with conn.transaction():
            project = await conn.fetchrow(
                """INSERT INTO projects (user_id, company_id, name, project_number, client_name)
                   VALUES ($1, $2, $3, $4, $5)
                   RETURNING id, name, project_number, client_name""",
                req.userId, company_id, req.name.strip(), req.project_number, req.client_name,
            )
            await conn.execute(
                "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')",
                project["id"], req.userId,
            )

            # Share membership with the rest of the company, same as
            # get_or_create_default_project's sharing rule.
            if company_id:
                teammates = await conn.fetch(
                    "SELECT id, permission_level FROM users WHERE company_id = $1 AND id != $2",
                    company_id, req.userId,
                )
                for teammate in teammates:
                    role = "owner" if teammate["permission_level"] == "owner" else "contributor"
                    await conn.execute(
                        """INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)
                           ON CONFLICT (project_id, user_id) DO NOTHING""",
                        project["id"], teammate["id"], role,
                    )

    return {"success": True, "project": dict(project)}


@router.get("/company/{company_id}")
async def get_company_projects(company_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, project_number, client_name FROM projects WHERE company_id = $1 ORDER BY created_at",
            company_id,
        )
    return {"success": True, "projects": [dict(r) for r in rows]}


@router.get("/{project_id}/members")
async def get_project_members(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        is_member = await conn.fetchval(
            "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
            project_id, userId,
        )
        if not is_member:
            raise HTTPException(403, "You do not have access to this project")

        members = await conn.fetch(
            """SELECT pm.user_id, pm.role, u.email, u.full_name, u.name
               FROM project_members pm
               JOIN users u ON u.id = pm.user_id
               WHERE pm.project_id = $1
               ORDER BY pm.role, u.full_name""",
            project_id,
        )
        pending_invites = await conn.fetch(
            "SELECT email, role, created_at FROM project_invites WHERE project_id = $1 AND accepted = false",
            project_id,
        )
    return {
        "success": True,
        "members": [dict(r) for r in members],
        "pending_invites": [dict(r) for r in pending_invites],
    }


@router.post("/{project_id}/invite")
async def invite_to_project(project_id: int, req: InviteRequest):
    if req.role not in INVITE_ROLES:
        raise HTTPException(400, f"role must be one of: {', '.join(INVITE_ROLES)}")

    email = req.email.lower().strip()
    if not email or "@" not in email:
        raise HTTPException(400, "A valid email is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        inviter = await conn.fetchrow(
            "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
            project_id, req.invitedBy,
        )
        if not inviter or inviter["role"] != "owner":
            raise HTTPException(403, "Only the project owner can invite teammates")

        project = await conn.fetchrow("SELECT name FROM projects WHERE id = $1", project_id)
        if not project:
            raise HTTPException(404, "Project not found")

        existing_user = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)

        if existing_user:
            await conn.execute(
                """INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)
                   ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role""",
                project_id, existing_user["id"], req.role,
            )
            status = "added"
        else:
            await conn.execute(
                """INSERT INTO project_invites (project_id, email, role, invited_by)
                   VALUES ($1, $2, $3, $4)
                   ON CONFLICT (project_id, email) DO UPDATE SET role = EXCLUDED.role, accepted = false""",
                project_id, email, req.role, req.invitedBy,
            )
            status = "invited"

    # Membership/invite is already committed at this point — a delivery failure
    # here shouldn't turn a successful invite into a 500.
    try:
        if status == "added":
            await send_email(
                to=email,
                subject=f"You've been added to {project['name']} on POMAR",
                html=f"""<p>You now have <strong>{req.role}</strong> access to
                          <strong>{project['name']}</strong> on POMAR.</p>
                          <a href="{FRONTEND_URL}">Open POMAR</a>""",
            )
        else:
            await send_email(
                to=email,
                subject=f"You've been invited to {project['name']} on POMAR",
                html=f"""<p>You've been invited to collaborate on <strong>{project['name']}</strong>
                          on POMAR as a <strong>{req.role}</strong>.</p>
                          <a href="{FRONTEND_URL}/register">Create your account</a> to get started —
                          use this same email address ({email}) and you'll be added automatically.""",
            )
    except Exception as e:
        print(f"Invite email to {email} failed to send: {e}")

    return {"success": True, "status": status}
