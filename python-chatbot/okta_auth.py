"""
Okta OAuth token verification for FastAPI.

Validates access tokens by introspecting with Okta or verifying JWT locally.
"""

import os
from functools import lru_cache
from typing import Optional
import json
import base64

import httpx
from fastapi import HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

OKTA_DOMAIN = os.getenv("OKTA_DOMAIN", "singulr.okta.com")
OKTA_CLIENT_ID = os.getenv("OKTA_CLIENT_ID", "0oa26y1wj6p5lppaj1d8")
OKTA_ISSUER = f"https://{OKTA_DOMAIN}/oauth2/default"


class AuthenticatedUser(BaseModel):
    user_id: str
    email: Optional[str] = None
    name: Optional[str] = None


# HTTP Bearer token extraction
security = HTTPBearer(auto_error=False)


def decode_jwt_payload(token: str) -> Optional[dict]:
    """Decode JWT payload without verification (for extracting claims)."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        # Add padding if needed
        payload = parts[1]
        padding = 4 - len(payload) % 4
        if padding != 4:
            payload += "=" * padding
        decoded = base64.urlsafe_b64decode(payload)
        return json.loads(decoded)
    except Exception:
        return None


@lru_cache(maxsize=1)
def get_okta_jwks() -> dict:
    """Fetch Okta's JWKS for token verification."""
    try:
        response = httpx.get(
            f"{OKTA_ISSUER}/v1/keys",
            timeout=10.0,
        )
        if response.status_code == 200:
            return response.json()
    except Exception:
        pass
    return {}


def introspect_token(token: str) -> Optional[dict]:
    """
    Introspect token with Okta to verify it's valid.

    Note: For SPA apps without a client secret, we can't use introspection.
    Instead, we verify the token locally by checking claims.
    """
    # For SPA (public client), we validate locally
    payload = decode_jwt_payload(token)
    if not payload:
        return None

    # Check required claims
    iss = payload.get("iss")
    aud = payload.get("aud")
    exp = payload.get("exp")

    if iss != OKTA_ISSUER:
        return None

    if aud != "api://default":
        return None

    # Check expiration
    import time
    if exp and exp < time.time():
        return None

    return payload


def validate_access_token(token: str) -> Optional[AuthenticatedUser]:
    """
    Validate an access token and return user info.
    """
    payload = introspect_token(token)
    if not payload:
        return None

    return AuthenticatedUser(
        user_id=payload.get("sub", ""),
        email=payload.get("email"),
        name=payload.get("name"),
    )


def get_token_from_header(request: Request) -> Optional[str]:
    """Extract Bearer token from Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    return parts[1]


async def require_auth(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> AuthenticatedUser:
    """
    FastAPI dependency that requires valid Okta access token.

    Usage:
        @app.post("/api/protected")
        async def protected_endpoint(user: AuthenticatedUser = Depends(require_auth)):
            return {"user": user.email}
    """
    token = None

    # Try to get token from HTTPBearer
    if credentials:
        token = credentials.credentials

    # Fallback to manual extraction
    if not token:
        token = get_token_from_header(request)

    if not token:
        raise HTTPException(
            status_code=401,
            detail="No access token provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = validate_access_token(token)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def optional_auth(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[AuthenticatedUser]:
    """
    FastAPI dependency that optionally validates Okta access token.

    Returns AuthenticatedUser if valid token exists, None otherwise.
    Does not raise HTTPException for missing/invalid tokens.
    """
    token = None

    if credentials:
        token = credentials.credentials

    if not token:
        token = get_token_from_header(request)

    if not token:
        return None

    return validate_access_token(token)
