"""Sets the login password of a member.

    uv run --no-project --with "psycopg[binary]" python scripts/set_password.py <email>

Reads DATABASE_URL_UNPOOLED (or DATABASE_URL) from the environment or .env.local.
The hash format must match src/server/password.ts.
"""

from __future__ import annotations

import base64
import getpass
import hashlib
import os
import secrets
import sys
from pathlib import Path

import psycopg

ITERATIONS = 100_000
MIN_LENGTH = 8


def load_env() -> None:
    env = Path(__file__).resolve().parent.parent / ".env.local"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        key, sep, value = line.partition("=")
        if sep and key.strip() and key.strip() not in os.environ:
            os.environ[key.strip()] = value.strip()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS, dklen=32)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return f"pbkdf2_sha256${ITERATIONS}${b64(salt)}${b64(digest)}"


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    email = sys.argv[1].strip().lower()
    load_env()
    url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL_UNPOOLED is not set")

    if sys.stdin.isatty():
        password = getpass.getpass("Nova senha: ")
        if password != getpass.getpass("Repita a senha: "):
            sys.exit("As senhas não conferem.")
    else:
        password = sys.stdin.readline().rstrip("\n")
    if len(password) < MIN_LENGTH:
        sys.exit(f"A senha precisa ter pelo menos {MIN_LENGTH} caracteres.")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute(
            "update members set password_hash = %s where lower(email) = %s returning name",
            (hash_password(password), email),
        )
        row = cur.fetchone()
        if not row:
            sys.exit(f"Nenhum membro com o e-mail {email}.")
        cur.execute(
            "delete from sessions where member_id = (select id from members where lower(email) = %s)", (email,)
        )
    print(f"Senha de {row[0]} definida.")


if __name__ == "__main__":
    main()
