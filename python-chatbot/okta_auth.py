"""
Okta session verification for FastAPI.

Validates the app session cookie by calling Okta's Sessions API.
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
    email: Optional[str] = None
    name: Optional[str] = None


def _get_session_cookie(request: Request) -> Optional[str]:
    return request.cookies.get(SESSION_COOKIE_NAME)


@lru_cache(maxsize=1000)
def _cached_session_validation(session_id: str) -> Optional[dict]:
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
    data = _cached_session_validation(session_id)
    if data:
        return OktaSession(**data)
    return None


def clear_session_cache() -> None:
    _cached_session_validation.cache_clear()


def _user_from_session(session: OktaSession) -> AuthenticatedUser:
    return AuthenticatedUser(
        user_id=session.userId,
        login=session.login,
        session_id=session.id,
        email=session.login,
        name=session.login,
    )


async def require_auth(request: Request) -> AuthenticatedUser:
    if not OKTA_DOMAIN:
        raise HTTPException(status_code=500, detail="OKTA_DOMAIN not configured")

    if not OKTA_API_TOKEN:
        raise HTTPException(status_code=500, detail="OKTA_API_TOKEN not configured")

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

    return _user_from_session(session)


async def optional_auth(request: Request) -> Optional[AuthenticatedUser]:
    if not OKTA_DOMAIN or not OKTA_API_TOKEN:
        return None

    session_id = _get_session_cookie(request)
    if not session_id:
        return None

    session = validate_session(session_id)
    if not session:
        return None

    return _user_from_session(session)
