from fastapi import HTTPException


async def require_project_member(conn, project_id: int, user_id: int, roles: tuple | None = None) -> str:
    """
    Raise 403 unless user_id is a project_members row for project_id. If `roles`
    is given, the member's role must also be one of them (e.g. ('owner',) for
    write operations that only the owner should perform). Returns the role.
    """
    row = await conn.fetchrow(
        "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
        project_id, user_id,
    )
    if not row:
        raise HTTPException(403, "You do not have access to this project")
    if roles and row["role"] not in roles:
        raise HTTPException(403, f"This action requires one of these roles: {', '.join(roles)}")
    return row["role"]


async def get_or_create_default_project(conn, user_id: int) -> int:
    row = await conn.fetchrow("SELECT id FROM projects WHERE user_id = $1 AND name = $2", user_id, "Default Project")
    if row:
        project_id = row["id"]
    else:
        row = await conn.fetchrow("INSERT INTO projects (user_id, name) VALUES ($1, $2) RETURNING id", user_id, "Default Project")
        project_id = row["id"]
    await conn.execute(
        """INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')
           ON CONFLICT (project_id, user_id) DO NOTHING""",
        project_id, user_id,
    )
    return project_id


async def accept_pending_invites(conn, user_id: int, email: str):
    """
    Called right after a user account is created or first verified (register,
    magic-link verify-token). Turns any project_invites rows sent to this
    email before the account existed into real project_members rows.
    """
    invites = await conn.fetch(
        "SELECT project_id, role FROM project_invites WHERE email = $1 AND status = 'pending'",
        email,
    )
    for invite in invites:
        await conn.execute(
            """INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)
               ON CONFLICT (project_id, user_id) DO NOTHING""",
            invite["project_id"], user_id, invite["role"],
        )
    if invites:
        await conn.execute(
            "UPDATE project_invites SET status = 'accepted' WHERE email = $1 AND status = 'pending'",
            email,
        )
