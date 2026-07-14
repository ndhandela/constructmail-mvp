#!/usr/bin/env python3
"""
Migrate existing plaintext procore_tokens to pgcrypto-encrypted values.

Run once after deploying the TOKEN_ENCRYPTION_KEY env var:
    python migrate_encrypt_tokens.py

Rows already encrypted are detected by attempting pgp_sym_decrypt — if it
succeeds the row is skipped; if it fails (wrong format) the row is plaintext
and gets encrypted in-place.
"""
import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()


async def main() -> None:
    key = os.getenv("TOKEN_ENCRYPTION_KEY")
    if not key:
        raise SystemExit("TOKEN_ENCRYPTION_KEY is not set — aborting.")

    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL is not set — aborting.")

    pool = await asyncpg.create_pool(dsn=dsn)
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT user_id, access_token, refresh_token FROM procore_tokens"
            )

        encrypted_count = 0
        skipped_count = 0

        for row in rows:
            user_id = row["user_id"]
            access_token = row["access_token"]
            refresh_token = row["refresh_token"]

            # Detect if already encrypted: try to decrypt; success → skip.
            async with pool.acquire() as conn:
                try:
                    await conn.fetchval(
                        "SELECT pgp_sym_decrypt($1::bytea, $2)",
                        access_token, key,
                    )
                    # Decryption succeeded → already encrypted.
                    skipped_count += 1
                    print(f"  [skip]    user_id={user_id} (already encrypted)")
                    continue
                except asyncpg.PostgresError:
                    # Decryption failed → plaintext; proceed to encrypt.
                    pass

                await conn.execute(
                    """UPDATE procore_tokens
                       SET access_token  = pgp_sym_encrypt($2, $3),
                           refresh_token = pgp_sym_encrypt($4, $3)
                       WHERE user_id = $1""",
                    user_id, access_token, key, refresh_token,
                )
                encrypted_count += 1
                print(f"  [encrypt] user_id={user_id}")

        print(
            f"\nDone. Encrypted: {encrypted_count},"
            f" already encrypted (skipped): {skipped_count}."
        )
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
