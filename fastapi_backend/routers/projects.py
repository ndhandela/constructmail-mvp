import os
import asyncpg
from datetime import date
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from db import get_pool
from services.email_service import send_email

router = APIRouter(prefix="/api/projects", tags=["Projects"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://pomar.ai")

INVITE_ROLES = ("contributor", "viewer")
PROJECT_STATUSES = ("planning", "active", "on_hold", "completed")
MEMBER_ROLES = ("owner", "contributor", "viewer")


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
            """SELECT p.id, p.name, p.project_number, p.client_name, p.status, p.location,
                      p.start_date, pm.role AS member_role
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

        try:
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
        except asyncpg.UniqueViolationError:
            raise HTTPException(409, "Your company already has a project with this name")

    return {"success": True, "project": dict(project)}


class UpdateProjectRequest(BaseModel):
    userId: int
    name: Optional[str] = None
    status: Optional[str] = None
    location: Optional[str] = None
    start_date: Optional[date] = None


@router.put("/{project_id}")
async def update_project(project_id: int, req: UpdateProjectRequest):
    """Edits project info fields (name/status/location/start_date). No
    `owner` field — project_members.role='owner' is already the
    permission-bearing owner (see invite_to_project below); this endpoint
    doesn't let it be reassigned as a side effect of an info edit."""
    if req.status is not None and req.status not in PROJECT_STATUSES:
        raise HTTPException(400, f"status must be one of: {', '.join(PROJECT_STATUSES)}")
    if req.name is not None and not req.name.strip():
        raise HTTPException(400, "Project name cannot be empty")

    pool = await get_pool()
    async with pool.acquire() as conn:
        member = await conn.fetchrow(
            "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
            project_id, req.userId,
        )
        if not member:
            raise HTTPException(403, "You do not have access to this project")
        if member["role"] != "owner":
            raise HTTPException(403, "Only the project owner can edit project settings")

        fields, values = [], []
        if req.name is not None:
            values.append(req.name.strip())
            fields.append(f"name = ${len(values)}")
        if req.status is not None:
            values.append(req.status)
            fields.append(f"status = ${len(values)}")
        if req.location is not None:
            values.append(req.location.strip() or None)
            fields.append(f"location = ${len(values)}")
        if req.start_date is not None:
            values.append(req.start_date)
            fields.append(f"start_date = ${len(values)}")

        if not fields:
            project = await conn.fetchrow(
                """SELECT id, name, project_number, client_name, status, location, start_date, created_at
                   FROM projects WHERE id = $1""",
                project_id,
            )
            return {"success": True, "project": dict(project)}

        values.append(project_id)
        query = f"""UPDATE projects SET {', '.join(fields)} WHERE id = ${len(values)}
                    RETURNING id, name, project_number, client_name, status, location, start_date, created_at"""
        try:
            project = await conn.fetchrow(query, *values)
        except asyncpg.UniqueViolationError:
            raise HTTPException(409, "A project with this name already exists")

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


@router.get("/{project_id}/trust-link")
async def get_project_trust_link(project_id: int, userId: int):
    """Lets Vendors/Clash/Mail optionally surface "this project also has
    POMAR Trust data" without knowing anything about Trust's schema beyond
    this one lookup. Safe to call for any project regardless of the caller's
    region/module access — a non-Trust company can never have a matching
    trust_projects row, so this is a no-op (has_trust_link: false) for them,
    not a new access path into Trust data."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        is_member = await conn.fetchval(
            "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
            project_id, userId,
        )
        if not is_member:
            raise HTTPException(403, "You do not have access to this project")

        trust_project = await conn.fetchrow(
            "SELECT id, project_name FROM trust_projects WHERE linked_project_id = $1",
            project_id,
        )
    return {
        "success": True,
        "has_trust_link": trust_project is not None,
        "trust_project_id": trust_project["id"] if trust_project else None,
        "trust_project_name": trust_project["project_name"] if trust_project else None,
    }


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


class UpdateProjectMemberRequest(BaseModel):
    requesterId: int
    role: str


async def _require_project_owner(conn, project_id: int, requester_id: int):
    requester = await conn.fetchrow(
        "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
        project_id, requester_id,
    )
    if not requester or requester["role"] != "owner":
        raise HTTPException(403, "Only the project owner can manage team members")


async def _refuse_if_last_owner(conn, project_id: int, member_id: int):
    """Guards against a project ending up with zero owners, which would lock
    everyone out of invite_to_project (owner-only) with no way back in."""
    owner_count = await conn.fetchval(
        "SELECT count(*) FROM project_members WHERE project_id = $1 AND role = 'owner'",
        project_id,
    )
    if owner_count <= 1:
        raise HTTPException(400, "A project must have at least one owner")


@router.patch("/{project_id}/team/{member_id}")
async def update_project_team_member(project_id: int, member_id: int, req: UpdateProjectMemberRequest):
    """Edits a team member's per-project role only — team members are
    references to real user accounts (project_members.user_id -> users.id),
    not freeform name/role pairs, so there's no per-project "name" to edit
    here. Renaming someone would mean editing users.full_name, which is
    shared across every project and their own Profile page, not scoped to
    this project's team list."""
    if req.role not in MEMBER_ROLES:
        raise HTTPException(400, f"role must be one of: {', '.join(MEMBER_ROLES)}")

    pool = await get_pool()
    async with pool.acquire() as conn:
        await _require_project_owner(conn, project_id, req.requesterId)

        target = await conn.fetchrow(
            "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
            project_id, member_id,
        )
        if not target:
            raise HTTPException(404, "This person is not a member of this project")

        if target["role"] == "owner" and req.role != "owner":
            await _refuse_if_last_owner(conn, project_id, member_id)

        row = await conn.fetchrow(
            """UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3
               RETURNING project_id, user_id, role""",
            req.role, project_id, member_id,
        )
    return {"success": True, "member": dict(row)}


@router.delete("/{project_id}/team/{member_id}")
async def remove_project_team_member(project_id: int, member_id: int, requesterId: int):
    """Removes this person from the project's team list only
    (project_members row) — never deletes the underlying user account."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await _require_project_owner(conn, project_id, requesterId)

        target = await conn.fetchrow(
            "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
            project_id, member_id,
        )
        if not target:
            raise HTTPException(404, "This person is not a member of this project")

        if target["role"] == "owner":
            await _refuse_if_last_owner(conn, project_id, member_id)

        await conn.execute(
            "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2",
            project_id, member_id,
        )
    return {"success": True}
