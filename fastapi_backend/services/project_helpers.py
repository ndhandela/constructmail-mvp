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
