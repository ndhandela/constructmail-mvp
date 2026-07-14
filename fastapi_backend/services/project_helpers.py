async def get_or_create_default_project(conn, user_id: int) -> int:
    row = await conn.fetchrow("SELECT id FROM projects WHERE user_id = $1 AND name = $2", user_id, "Default Project")
    if row:
        return row["id"]
    row = await conn.fetchrow("INSERT INTO projects (user_id, name) VALUES ($1, $2) RETURNING id", user_id, "Default Project")
    return row["id"]
