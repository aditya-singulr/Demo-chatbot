"""
Okta session verification for FastAPI.

Validates session cookies by calling Okta's Sessions API.
"""

import os
from functools import lru_cache
from typing import Optional

import httpx
from fastapi import HTTPException, Request
from pydantic import BaseModel

OKTA_DOMAIN = os.getenv("OKTA_DOMAIN", "singulr.okta.com")
OKTA_API_TOKEN = os.getenv("OKTA_API_TOKEN", "")
SESSION_COOKIE_NAME = os.getenv("OKTA_SESSION_COOKIE_NAME", "okta_session")

# Cache session validation for 60 seconds to reduce Okta API calls
SESSION_CACHE_TTL = int(os.getenv("OKTA_SESSION_CACHE_TTL", "60"))


class OktaSession(BaseModel):
    id: str
    login: str
    userId: str
    status: str
    expiresAt: str


class AuthenticatedUser(BaseModel):
    user_id: str
    login: str
    session_id: str


def _get_session_cookie(request: Request) -> Optional[str]:
    """Extract session ID from cookie."""
    return request.cookies.get(SESSION_COOKIE_NAME)


@lru_cache(maxsize=1000)
def _cached_session_validation(session_id: str) -> Optional[dict]:
    """
    Validate session with Okta API (cached).

    Note: This is a simple in-memory cache. In production, consider using
    Redis or similar for distributed caching.
    """
    if not OKTA_DOMAIN or not OKTA_API_TOKEN:
        return None

    try:
        response = httpx.get(
            f"https://{OKTA_DOMAIN}/api/v1/sessions/{session_id}",
            headers={
                "Authorization": f"SSWS {OKTA_API_TOKEN}",
                "Accept": "application/json",
            },
            timeout=10.0,
        )

        if response.status_code == 200:
            data = response.json()
            if data.get("status") == "ACTIVE":
                return data
        return None

    except Exception:
        return None


def validate_session(session_id: str) -> Optional[OktaSession]:
    """
    Validate a session ID with Okta.

    Returns OktaSession if valid, None otherwise.
    """
    data = _cached_session_validation(session_id)
    if data:
        return OktaSession(**data)
    return None


def clear_session_cache(session_id: str = None):
    """Clear cached session validation."""
    if session_id:
        _cached_session_validation.cache_clear()
    else:
        _cached_session_validation.cache_clear()


async def require_auth(request: Request) -> AuthenticatedUser:
    """
    FastAPI dependency that requires valid Okta session.

    Usage:
        @app.post("/api/protected")
        async def protected_endpoint(user: AuthenticatedUser = Depends(require_auth)):
            return {"user": user.login}
    """
    if not OKTA_DOMAIN:
        raise HTTPException(
            status_code=500,
            detail="OKTA_DOMAIN not configured",
        )

    if not OKTA_API_TOKEN:
        raise HTTPException(
            status_code=500,
            detail="OKTA_API_TOKEN not configured",
        )

    session_id = _get_session_cookie(request)

    if not session_id:
        raise HTTPException(
            status_code=401,
            detail="No session cookie found",
            headers={"WWW-Authenticate": "Cookie"},
        )

    session = validate_session(session_id)

    if not session:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session",
            headers={"WWW-Authenticate": "Cookie"},
        )

    return AuthenticatedUser(
        user_id=session.userId,
        login=session.login,
        session_id=session.id,
    )


async def optional_auth(request: Request) -> Optional[AuthenticatedUser]:
    """
    FastAPI dependency that optionally validates Okta session.

    Returns AuthenticatedUser if valid session exists, None otherwise.
    Does not raise HTTPException for missing/invalid sessions.
    """
    if not OKTA_DOMAIN or not OKTA_API_TOKEN:
        return None

    session_id = _get_session_cookie(request)
    if not session_id:
        return None

    session = validate_session(session_id)
    if not session:
        return None

    return AuthenticatedUser(
        user_id=session.userId,
        login=session.login,
        session_id=session.id,
    )


def logout_session(session_id: str) -> bool:
    """
    Revoke a session with Okta.

    Returns True if successful, False otherwise.
    """
    if not OKTA_DOMAIN or not OKTA_API_TOKEN:
        return False

    try:
        response = httpx.delete(
            f"https://{OKTA_DOMAIN}/api/v1/sessions/{session_id}",
            headers={
                "Authorization": f"SSWS {OKTA_API_TOKEN}",
                "Accept": "application/json",
            },
            timeout=10.0,
        )
        clear_session_cache(session_id)
        return response.status_code == 204
    except Exception:
        return False
