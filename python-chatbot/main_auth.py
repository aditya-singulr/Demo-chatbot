"""Unified authenticated backend for the NovaPay chatbot.

This service owns the Okta, username/password-token, and OTP-cookie flows.
Each flow has its own explicitly namespaced routes and authentication
dependency, while chat/provider execution is shared in chat_core.py.
"""

import os
import secrets
from typing import Optional

import env_config

env_config.setup(__name__)

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

import chat_core
import providers
from okta_auth import AuthenticatedUser, optional_auth, require_auth

app = FastAPI(title="NovaPay Python Chatbot (Authenticated)")
# authenticated_ui_port = os.getenv("AUTHENTICATED_UI_PORT")
# ALLOWED_ORIGINS = [
#     origin.strip()
#     for origin in os.getenv(
#         "CORS_ALLOWED_ORIGINS",
#         f"http://localhost:{authenticated_ui_port},https://chat-demo-external.singulr.ai",
#     ).split(",")
#     if origin.strip()
# ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LOGIN_USERNAME = os.getenv("LOGIN_USERNAME", "testuser")
LOGIN_PASSWORD = os.getenv("LOGIN_PASSWORD", "Secrets!23")
LOGIN_TOKEN = os.getenv("LOGIN_TOKEN", "novapay-static-token")

OTP_LOGIN_USERNAME = os.getenv("OTP_LOGIN_USERNAME", "testuser")
OTP_LOGIN_PASSWORD = os.getenv("OTP_LOGIN_PASSWORD", "Secrets!23")
OTP_LOGIN_CODE = os.getenv("OTP_LOGIN_CODE", "123456")
OTP_CHAT_SESSION = os.getenv("OTP_CHAT_SESSION", "novapay-otp-chat-session")
OTP_CHAT_COOKIE_NAME = os.getenv("OTP_CHAT_COOKIE_NAME", "novapay_chat_session")
OTP_CHAT_COOKIE_MAX_AGE = int(os.getenv("OTP_CHAT_COOKIE_MAX_AGE", "3600"))
OTP_CHAT_COOKIE_SECURE = os.getenv("OTP_CHAT_COOKIE_SECURE", "false").lower() == "true"

security = HTTPBearer(auto_error=False)


class LoginRequest(BaseModel):
    username: str
    password: str


class OtpRequest(BaseModel):
    username: str
    otp: str


def _extract_token(
    credentials: Optional[HTTPAuthorizationCredentials],
    authorization: Optional[str],
) -> Optional[str]:
    if credentials:
        return credentials.credentials
    if authorization:
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() == "bearer" and value:
            return value.strip()
        return authorization.strip()
    return None


def require_login_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    authorization: Optional[str] = Header(None),
) -> str:
    token = _extract_token(credentials, authorization)
    if not token or not secrets.compare_digest(token, LOGIN_TOKEN):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


def optional_login_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    authorization: Optional[str] = Header(None),
) -> Optional[str]:
    token = _extract_token(credentials, authorization)
    if token and secrets.compare_digest(token, LOGIN_TOKEN):
        return token
    return None


def require_otp_session(
    chat_session: Optional[str] = Cookie(default=None, alias=OTP_CHAT_COOKIE_NAME),
) -> str:
    if not chat_session or not secrets.compare_digest(chat_session, OTP_CHAT_SESSION):
        raise HTTPException(
            status_code=401,
            detail="Valid chat session required",
            headers={"WWW-Authenticate": "Cookie"},
        )
    return chat_session


def optional_otp_session(
    chat_session: Optional[str] = Cookie(default=None, alias=OTP_CHAT_COOKIE_NAME),
) -> Optional[str]:
    if chat_session and secrets.compare_digest(chat_session, OTP_CHAT_SESSION):
        return chat_session
    return None


async def _ui_chat(
    req: chat_core.UiChatRequest,
    user: dict,
) -> dict:
    reply = await chat_core.generate_reply(req.messages, provider=req.provider)
    return chat_core.ui_response(reply, req.provider, user)


async def _api_chat(req: chat_core.ApiChatRequest) -> dict:
    reply = await chat_core.generate_reply(req.messages, provider=req.provider)
    return chat_core.api_response(reply, req.provider)


def _providers() -> dict:
    return {"providers": providers.list_providers(), "default": providers.DEFAULT_PROVIDER}


# Okta routes
@app.post("/api/auth/ui")
async def okta_ui_chat(
    req: chat_core.UiChatRequest,
    user: AuthenticatedUser = Depends(require_auth),
):
    return await _ui_chat(
        req,
        {"email": user.email, "user_id": user.user_id},
    )


@app.get("/api/auth/providers")
async def okta_providers():
    return _providers()


@app.get("/api/auth/me")
async def okta_me(user: AuthenticatedUser = Depends(require_auth)):
    return {
        "user_id": user.user_id,
        "email": user.email,
        "name": user.name,
        "authenticated": True,
    }


@app.get("/api/auth/check")
async def okta_check(user: Optional[AuthenticatedUser] = Depends(optional_auth)):
    if user:
        return {"authenticated": True, "user_id": user.user_id, "email": user.email}
    return {"authenticated": False}


# Username/password token routes
@app.post("/api/login")
async def login(req: LoginRequest):
    if not (
        secrets.compare_digest(req.username, LOGIN_USERNAME)
        and secrets.compare_digest(req.password, LOGIN_PASSWORD)
    ):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {
        "token": LOGIN_TOKEN,
        "token_type": "Bearer",
        "user": {"username": req.username},
    }


@app.post("/api/login/ui")
async def login_ui_chat(
    req: chat_core.UiChatRequest,
    _: str = Depends(require_login_token),
):
    return await _ui_chat(req, {"username": LOGIN_USERNAME})


@app.post("/api/login/chat")
async def login_api_chat(
    req: chat_core.ApiChatRequest,
    _: str = Depends(require_login_token),
):
    return await _api_chat(req)


@app.get("/api/login/providers")
async def login_providers():
    return _providers()


@app.get("/api/login/me")
async def login_me(_: str = Depends(require_login_token)):
    return {"username": LOGIN_USERNAME, "authenticated": True}


@app.get("/api/login/check")
async def login_check(token: Optional[str] = Depends(optional_login_token)):
    if token:
        return {"authenticated": True, "username": LOGIN_USERNAME}
    return {"authenticated": False}


# Username/password + OTP cookie routes
@app.post("/api/otp-login/login")
async def otp_login(req: LoginRequest):
    if not (
        secrets.compare_digest(req.username, OTP_LOGIN_USERNAME)
        and secrets.compare_digest(req.password, OTP_LOGIN_PASSWORD)
    ):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {
        "otp_required": True,
        "user": {"username": req.username},
        "message": "OTP verification required",
    }


@app.post("/api/otp-login/verify")
async def verify_otp(req: OtpRequest, response: Response):
    if not secrets.compare_digest(req.username, OTP_LOGIN_USERNAME):
        raise HTTPException(status_code=401, detail="Invalid login challenge")
    if not secrets.compare_digest(req.otp, OTP_LOGIN_CODE):
        raise HTTPException(status_code=401, detail="Invalid OTP")

    response.set_cookie(
        key=OTP_CHAT_COOKIE_NAME,
        value=OTP_CHAT_SESSION,
        max_age=OTP_CHAT_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=OTP_CHAT_COOKIE_SECURE,
        path="/",
    )
    return {
        "authenticated": True,
        "user": {"username": req.username},
        "cookie_name": OTP_CHAT_COOKIE_NAME,
    }


@app.post("/api/otp-login/logout")
async def otp_logout(response: Response):
    response.delete_cookie(key=OTP_CHAT_COOKIE_NAME, path="/")
    return {"authenticated": False}


@app.post("/api/otp-login/ui")
async def otp_ui_chat(
    req: chat_core.UiChatRequest,
    _: str = Depends(require_otp_session),
):
    return await _ui_chat(req, {"username": OTP_LOGIN_USERNAME})


@app.post("/api/otp-login/chat")
async def otp_api_chat(
    req: chat_core.ApiChatRequest,
    _: str = Depends(require_otp_session),
):
    return await _api_chat(req)


@app.get("/api/otp-login/providers")
async def otp_providers():
    return _providers()


@app.get("/api/otp-login/me")
async def otp_me(_: str = Depends(require_otp_session)):
    return {"username": OTP_LOGIN_USERNAME, "authenticated": True}


@app.get("/api/otp-login/check")
async def otp_check(session: Optional[str] = Depends(optional_otp_session)):
    if session:
        return {"authenticated": True, "username": OTP_LOGIN_USERNAME}
    return {"authenticated": False}


@app.get("/api/providers")
async def providers_compat():
    return _providers()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "backend": "python-authenticated",
        "model": providers.BEDROCK_MODEL_ID,
        "auth": ["okta-oauth", "username-password", "username-password-otp-cookie"],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=env_config.get_bind_host(),
        port=env_config.get_backend_port("BACKEND_PORT_AUTHENTICATED", default=8003),
    )
