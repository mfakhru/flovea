"""Password hashing and JWT encode/verify, stdlib-only (no bcrypt/PyJWT).

Avoids depending on Pyodide package compatibility for security-critical code
in a still-maturing runtime; the logic here is small enough that stdlib-only
is not a real burden.
"""

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import HTTPException, Request

COOKIE_NAME = "flovea_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 30  # ~30 days, matches the cookie expiry in the plan

_PBKDF2_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return f"{_PBKDF2_ITERATIONS}${salt.hex()}${derived.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        iterations_s, salt_hex, hash_hex = stored.split("$")
        derived = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations_s)
        )
        expected = bytes.fromhex(hash_hex)
    except (ValueError, AttributeError):
        return False
    return hmac.compare_digest(derived, expected)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def create_token(payload: dict, secret: str, expires_in_seconds: int) -> str:
    now = int(time.time())
    body = {**payload, "iat": now, "exp": now + expires_in_seconds}
    segments = [
        _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode()),
        _b64url_encode(json.dumps(body, separators=(",", ":")).encode()),
    ]
    signing_input = ".".join(segments).encode("ascii")
    signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    segments.append(_b64url_encode(signature))
    return ".".join(segments)


def verify_token(token: str, secret: str) -> dict | None:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
    except ValueError:
        return None

    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected_signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    try:
        actual_signature = _b64url_decode(signature_b64)
    except ValueError:
        return None
    if not hmac.compare_digest(expected_signature, actual_signature):
        return None

    try:
        payload = json.loads(_b64url_decode(payload_b64))
    except (ValueError, json.JSONDecodeError):
        return None
    if payload.get("exp", 0) < int(time.time()):
        return None
    return payload


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    env = request.scope["env"]
    payload = verify_token(token, str(env.JWT_SECRET))
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return payload
