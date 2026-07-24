"""
Provider registry — LiteLLM SDK edition.

Instead of dispatching to per-SDK techniques (boto3, anthropic, openai,
langchain — see providers.py), every call here goes through the `litellm`
Python SDK's completion() function, pointed at a LiteLLM proxy. The proxy
applies Singulr guardrails server-side; this file only needs the proxy's
base URL, an API key, and a model name.

The "provider" the UI selects from is therefore a *model name* registered on
the proxy (e.g. "gpt-4o", "claude-sonnet-4-5"), not an SDK technique.
"""
import os

import litellm
import requests

LITELLM_BASE_URL = os.getenv("LITELLM_BASE_URL", "http://35.226.69.233:4000/")
LITELLM_API_KEY = os.getenv("LITELLM_API_KEY", "sk-9960350851asksingulr")

MAX_TOKENS = 1024
TEMPERATURE = 0.1


def _chat_messages(messages: list[dict]) -> list[dict]:
    """Keep only user/assistant turns as {role, content} plain dicts."""
    return [
        {"role": m["role"], "content": m["content"]}
        for m in messages
        if m["role"] in ("user", "assistant")
    ]


def _model_names() -> list[str]:
    """Model names registered on the LiteLLM proxy, for the UI dropdown."""
    try:
        response = requests.get(
            f"{LITELLM_BASE_URL.rstrip('/')}/model/info",
            headers={"Authorization": f"Bearer {LITELLM_API_KEY}"},
            timeout=10,
        )
        response.raise_for_status()
        names = sorted(
            {
                entry["model_name"]
                for entry in response.json().get("data", [])
                if entry.get("model_name")
            }
        )
        if names:
            return names
    except Exception:
        pass
    return [DEFAULT_PROVIDER]


def call_litellm(messages: list[dict], system: str, model: str) -> str:
    response = litellm.completion(
        model=model,
        api_base=LITELLM_BASE_URL,
        api_key=LITELLM_API_KEY,
        custom_llm_provider="openai",
        # temperature=TEMPERATURE,
        max_tokens=MAX_TOKENS,
        messages=[{"role": "system", "content": system}, *_chat_messages(messages)],
    )
    message = response.choices[0].message
    return message.content or ""


DEFAULT_PROVIDER = os.getenv("LITELLM_DEFAULT_MODEL", "gpt-4o")


def _guardrail_block_message(exc: Exception) -> str | None:
    """If an exception is actually a Singulr guardrail block, return its text.

    The LiteLLM proxy raises a BadRequestError whose message contains
    "Guardrail raised an exception ... Message: <reason>" when a guardrail
    (e.g. singulr_guardrail) blocks a request. Real errors (no such marker)
    still propagate.
    """
    msg = str(exc)
    marker = "Message: "
    idx = msg.find(marker)
    if idx != -1 and ("Guardrail" in msg or "Blocked" in msg):
        return f"[Blocked by guardrail] {msg[idx + len(marker):]}"
    idx = msg.find("[Blocked")
    return msg[idx:] if idx != -1 else None


def resolve_provider(provider: str | None):
    """Return a call(messages, system) bound to `provider` (a model name).

    Falls back to DEFAULT_PROVIDER. Wrapped so a guardrail block surfaces as
    normal reply text instead of raising.
    """
    model = provider or DEFAULT_PROVIDER

    def guarded(messages: list[dict], system: str) -> str:
        try:
            return call_litellm(messages, system, model)
        except Exception as exc:
            blocked = _guardrail_block_message(exc)
            if blocked is not None:
                return blocked
            raise

    return guarded


def list_providers() -> list[dict]:
    """Lightweight metadata for the UI dropdown."""
    return [{"id": name, "label": name} for name in _model_names()]
