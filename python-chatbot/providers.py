"""
Provider registry — one callable per "sample app" technique.

Each technique mirrors an example from
    singulr-sdk-sample-apps/sample_apps/
but is adapted to take a live chat history (`messages`) and a `system` prompt
and return the assistant's reply as plain text.

Guardrails are NOT applied here. The hosting app decides: if it has called
    `singulr_sdk.configure()` (see main_guardrail.py) every client below is
transparently routed through the Singulr proxy; if it has not (main.py) the
same calls go straight to the provider. The technique code is identical either
way — that is the whole point of the SDK.

Multimodal notes (Bedrock) — native formats only, no text-extraction fallbacks:
  - converse / converse_stream: images (png/jpeg/gif/webp) + documents
    (pdf/csv/doc/docx/xls/xlsx/html/txt/md). Documents require a text block.
  - invoke_model / invoke_model_stream (Anthropic Claude): images
    (png/jpeg/gif/webp) + PDF document blocks only.
"""
import base64
import json
import os
import re
import uuid

AWS_REGION = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION", "us-east-1")

# Bedrock model id (Claude on Bedrock by default).
BEDROCK_MODEL_ID = os.getenv(
    "BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
)
# Native (non-Bedrock) model ids for the direct SDK techniques.
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions"

# The OpenAI / Anthropic client libraries refuse to build a request unless an
# api_key is present locally — even when routed through the Singulr proxy, which
# authenticates with its own gateway token and supplies the real upstream key.
# So fall back to a harmless placeholder when no real key is configured:
#   - guardrail mode  -> proxy handles auth, placeholder is fine
#   - no-guardrail mode -> hits the provider directly and (correctly) 401s
def _openai_key() -> str:
    return os.getenv("OPENAI_API_KEY") or "sk-singulr-local"


def _anthropic_key() -> str:
    return os.getenv("ANTHROPIC_API_KEY") or "sk-ant-singulr-local"

MAX_TOKENS = 1024
TEMPERATURE = 0.2


# --------------------------------------------------------------------------- #
# Shared helpers
# --------------------------------------------------------------------------- #
IMAGE_MEDIA_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/jpg": "jpeg",
    "image/gif": "gif",
    "image/webp": "webp",
}
# Native Converse DocumentBlock formats only (no text-extraction workarounds).
CONVERSE_DOCUMENT_FORMATS = {
    "pdf": "pdf",
    "application/pdf": "pdf",
    "csv": "csv",
    "text/csv": "csv",
    "doc": "doc",
    "application/msword": "doc",
    "docx": "docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "xls": "xls",
    "application/vnd.ms-excel": "xls",
    "xlsx": "xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "html": "html",
    "text/html": "html",
    "txt": "txt",
    "text/plain": "txt",
    "md": "md",
    "text/markdown": "md",
    "text/x-markdown": "md",
}
# Native Anthropic InvokeModel document blocks on Bedrock: PDF only (+ images).
INVOKE_DOCUMENT_FORMATS = {
    "pdf": "pdf",
    "application/pdf": "pdf",
}

# UI <input accept="..."> strings — native formats only per API family.
CONVERSE_FILE_ACCEPT = (
    ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.html,.doc,.docx,.xls,.xlsx,"
    "image/png,image/jpeg,image/gif,image/webp,application/pdf,"
    "text/plain,text/markdown,text/csv,text/html,"
    "application/msword,"
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document,"
    "application/vnd.ms-excel,"
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)
INVOKE_FILE_ACCEPT = (
    ".png,.jpg,.jpeg,.gif,.webp,.pdf,"
    "image/png,image/jpeg,image/gif,image/webp,application/pdf"
)
DEFAULT_FILE_PROMPT = "Please analyze the attached file(s)."


def _chat_messages(messages: list[dict]) -> list[dict]:
    """Keep only user/assistant turns; preserve optional attachments."""
    out = []
    for m in messages:
        if m["role"] not in ("user", "assistant"):
            continue
        entry = {"role": m["role"], "content": m.get("content") or ""}
        attachments = m.get("attachments") or []
        if attachments:
            entry["attachments"] = attachments
        out.append(entry)
    return out


def _boto_session():
    import boto3

    return boto3.Session(
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=AWS_REGION,
    )


def _bedrock_client():
    return _boto_session().client("bedrock-runtime")


def _agent_runtime_client():
    return _boto_session().client("bedrock-agent-runtime")


def _latest_user_text(messages: list[dict]) -> str:
    """Agent / flow / KB APIs take a single input string, not a message list."""
    for m in reversed(_chat_messages(messages)):
        if m["role"] == "user":
            return m["content"]
    return ""


def _attachment_bytes(att: dict) -> bytes:
    data = att.get("data") or ""
    if isinstance(data, bytes):
        return data
    return base64.b64decode(data)


def _attachment_media_type(att: dict) -> str:
    return (att.get("media_type") or "").lower().strip()


def _attachment_ext(att: dict) -> str:
    name = att.get("name") or ""
    if "." in name:
        return name.rsplit(".", 1)[-1].lower()
    return ""


def _document_name(att: dict) -> str:
    """Unique Converse document name — Bedrock rejects duplicate names in a request."""
    raw = (att.get("name") or "document").rsplit(".", 1)[0]
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", raw).strip("_") or "document"
    suffix = uuid.uuid4().hex
    # Leave room for "_" + 32-char uuid; Bedrock caps names at 200 chars.
    return f"{cleaned[:167]}_{suffix}"


def _is_image_attachment(att: dict) -> bool:
    mt = _attachment_media_type(att)
    if mt in IMAGE_MEDIA_TYPES:
        return True
    return _attachment_ext(att) in {"png", "jpg", "jpeg", "gif", "webp"}


def _image_format(att: dict) -> str:
    mt = _attachment_media_type(att)
    if mt in IMAGE_MEDIA_TYPES:
        return IMAGE_MEDIA_TYPES[mt]
    ext = _attachment_ext(att)
    return "jpeg" if ext == "jpg" else (ext or "png")


def _document_format(att: dict, allowed: dict[str, str]) -> str | None:
    mt = _attachment_media_type(att)
    if mt in allowed:
        return allowed[mt]
    ext = _attachment_ext(att)
    return allowed.get(ext)


def _message_text_for_files(text: str, attachments: list) -> str:
    """Converse requires a text block when a document is present; always pair files with text."""
    text = (text or "").strip()
    if text:
        return text
    if attachments:
        return DEFAULT_FILE_PROMPT
    return ""


def _unsupported_file_error(api: str, att: dict, hint: str) -> RuntimeError:
    label = att.get("name") or att.get("media_type") or "unknown"
    return RuntimeError(f"Unsupported file type for {api}: {label}. {hint}")


def _converse_content_blocks(m: dict) -> list[dict]:
    """Build Bedrock Converse content blocks (native text + image/document only)."""
    attachments = m.get("attachments") or []
    text = _message_text_for_files(m.get("content") or "", attachments)
    blocks: list[dict] = []
    if text:
        blocks.append({"text": text})
    for att in attachments:
        if _is_image_attachment(att):
            blocks.append(
                {
                    "image": {
                        "format": _image_format(att),
                        "source": {"bytes": _attachment_bytes(att)},
                    }
                }
            )
            continue
        fmt = _document_format(att, CONVERSE_DOCUMENT_FORMATS)
        if not fmt:
            raise _unsupported_file_error(
                "Bedrock Converse",
                att,
                "Supported: png, jpeg, gif, webp, pdf, csv, doc, docx, xls, xlsx, html, txt, md.",
            )
        blocks.append(
            {
                "document": {
                    "format": fmt,
                    "name": _document_name(att),
                    "source": {"bytes": _attachment_bytes(att)},
                }
            }
        )
    return blocks or [{"text": ""}]


def _anthropic_content_blocks(m: dict) -> list[dict]:
    """Build Anthropic InvokeModel content blocks (native image + PDF document only)."""
    attachments = m.get("attachments") or []
    text = _message_text_for_files(m.get("content") or "", attachments)
    blocks: list[dict] = []
    for att in attachments:
        raw_b64 = att.get("data") or ""
        if isinstance(raw_b64, bytes):
            raw_b64 = base64.b64encode(raw_b64).decode("ascii")
        if _is_image_attachment(att):
            fmt = _image_format(att)
            media_type = f"image/{fmt}" if fmt != "jpg" else "image/jpeg"
            blocks.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": raw_b64,
                    },
                }
            )
            continue
        fmt = _document_format(att, INVOKE_DOCUMENT_FORMATS)
        if fmt != "pdf":
            raise _unsupported_file_error(
                "Bedrock InvokeModel",
                att,
                "Supported: png, jpeg, gif, webp, pdf only.",
            )
        blocks.append(
            {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": raw_b64,
                },
                "title": _document_name(att),
            }
        )
    if text:
        blocks.append({"type": "text", "text": text})
    return blocks or [{"type": "text", "text": ""}]


# Stable session id for the demo (agent APIs require one per conversation).
AGENT_SESSION_ID = os.getenv("BEDROCK_AGENT_SESSION_ID", "singulr-demo-session")

# Number of vector-search results the Knowledge Base RAG retriever pulls.
RAG_NUMBER_OF_RESULTS = int(os.getenv("BEDROCK_RAG_NUM_RESULTS", "1"))


def _account_id() -> str:
    return _boto_session().client("sts").get_caller_identity()["Account"]


def _rag_model_arn() -> str:
    """Build the modelArn for retrieve_and_generate.

    BEDROCK_MODEL_ID may be a cross-region inference profile (e.g.
    'us.anthropic.claude-...'), which must be referenced as an
    inference-profile ARN, not a foundation-model ARN. Set BEDROCK_RAG_MODEL_ARN
    to override entirely.
    """
    explicit = os.getenv("BEDROCK_RAG_MODEL_ARN")
    if explicit:
        return explicit
    # Inference-profile ids carry a region prefix: "us.", "eu.", "apac." ...
    if re.match(r"^[a-z]{2,4}\.", BEDROCK_MODEL_ID):
        return (
            f"arn:aws:bedrock:{AWS_REGION}:{_account_id()}"
            f":inference-profile/{BEDROCK_MODEL_ID}"
        )
    return f"arn:aws:bedrock:{AWS_REGION}::foundation-model/{BEDROCK_MODEL_ID}"


# --------------------------------------------------------------------------- #
# Technique: boto3 Bedrock — converse   (sample: bedrock_converse.py)
# --------------------------------------------------------------------------- #
def call_bedrock_converse(messages: list[dict], system: str) -> str:
    client = _bedrock_client()
    response = client.converse(
        modelId=BEDROCK_MODEL_ID,
        system=[{"text": system}],
        messages=[
            {"role": m["role"], "content": _converse_content_blocks(m)}
            for m in _chat_messages(messages)
        ],
        inferenceConfig={"maxTokens": MAX_TOKENS, "temperature": TEMPERATURE},
    )
    return response["output"]["message"]["content"][0]["text"]


# --------------------------------------------------------------------------- #
# Technique: boto3 Bedrock — invoke_model   (sample: bedrock_invoke_model.py)
# --------------------------------------------------------------------------- #
def call_bedrock_invoke_model(messages: list[dict], system: str) -> str:
    client = _bedrock_client()
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": MAX_TOKENS,
        "temperature": TEMPERATURE,
        "system": system,
        "messages": [
            {"role": m["role"], "content": _anthropic_content_blocks(m)}
            for m in _chat_messages(messages)
        ],
    }
    response = client.invoke_model(modelId=BEDROCK_MODEL_ID, body=json.dumps(body))
    payload = json.loads(response["body"].read())
    # Direct Bedrock returns the native Anthropic shape; the Singulr proxy
    # returns a Converse-shaped body. Handle both.
    if "output" in payload:
        return payload["output"]["message"]["content"][0]["text"]
    return payload["content"][0]["text"]


# --------------------------------------------------------------------------- #
# Technique: Anthropic SDK   (sample: anthropic_sdk.py)
# --------------------------------------------------------------------------- #
def call_anthropic_sdk(messages: list[dict], system: str) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=_anthropic_key())
    response = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=MAX_TOKENS,
        temperature=TEMPERATURE,
        system=system,
        messages=_chat_messages(messages),
    )
    return response.content[0].text


# --------------------------------------------------------------------------- #
# Technique: OpenAI SDK   (sample: openai_sdk.py)
# --------------------------------------------------------------------------- #
def call_openai_sdk(messages: list[dict], system: str) -> str:
    from openai import OpenAI

    client = OpenAI(api_key=_openai_key())
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        temperature=TEMPERATURE,
        max_tokens=MAX_TOKENS,
        messages=[{"role": "system", "content": system}, *_chat_messages(messages)],
    )
    return response.choices[0].message.content


# --------------------------------------------------------------------------- #
# Technique: Groq — httpx chat completions
# --------------------------------------------------------------------------- #
def call_groq(messages: list[dict], system: str) -> str:
    import httpx

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("Set GROQ_API_KEY in .env to use this provider")

    response = httpx.post(
        GROQ_CHAT_COMPLETIONS_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": system},
                *_chat_messages(messages),
            ],
        },
        timeout=60.0,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


# --------------------------------------------------------------------------- #
# LangChain techniques   (samples: langchain_bedrock / _anthropic / _openai)
# --------------------------------------------------------------------------- #
def _langchain_messages(messages: list[dict], system: str):
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

    out = [SystemMessage(content=system)]
    for m in _chat_messages(messages):
        if m["role"] == "assistant":
            out.append(AIMessage(content=m["content"]))
        else:
            out.append(HumanMessage(content=m["content"]))
    return out


def call_langchain_bedrock(messages: list[dict], system: str) -> str:
    # ChatBedrockConverse uses the Bedrock Converse API. Plain ChatBedrock uses
    # invoke_model, whose proxy-translated response shape it can't parse (returns
    # empty); the converse path works identically with and without the guardrail.
    from langchain_aws import ChatBedrockConverse

    llm = ChatBedrockConverse(
        model=BEDROCK_MODEL_ID,
        region_name=AWS_REGION,
        max_tokens=MAX_TOKENS,
        temperature=TEMPERATURE,
    )
    return llm.invoke(_langchain_messages(messages, system)).content


def call_langchain_anthropic(messages: list[dict], system: str) -> str:
    from langchain_anthropic import ChatAnthropic

    llm = ChatAnthropic(
        model=ANTHROPIC_MODEL,
        max_tokens=MAX_TOKENS,
        temperature=TEMPERATURE,
        api_key=_anthropic_key(),
    )
    return llm.invoke(_langchain_messages(messages, system)).content


def call_langchain_openai(messages: list[dict], system: str) -> str:
    from langchain_openai import ChatOpenAI

    llm = ChatOpenAI(
        model=OPENAI_MODEL,
        max_tokens=MAX_TOKENS,
        temperature=TEMPERATURE,
        api_key=_openai_key(),
    )
    return llm.invoke(_langchain_messages(messages, system)).content


# --------------------------------------------------------------------------- #
# Streaming techniques — the UI is request/response, so the stream is collected
# server-side into a single string.
# --------------------------------------------------------------------------- #
def call_bedrock_converse_stream(messages: list[dict], system: str) -> str:
    """sample: bedrock_converse_stream.py"""
    client = _bedrock_client()
    response = client.converse_stream(
        modelId=BEDROCK_MODEL_ID,
        system=[{"text": system}],
        messages=[
            {"role": m["role"], "content": _converse_content_blocks(m)}
            for m in _chat_messages(messages)
        ],
        inferenceConfig={"maxTokens": MAX_TOKENS, "temperature": TEMPERATURE},
    )
    parts = []
    for event in response["stream"]:
        if "contentBlockDelta" in event:
            parts.append(event["contentBlockDelta"]["delta"].get("text", ""))
    return "".join(parts)


def call_bedrock_invoke_model_stream(messages: list[dict], system: str) -> str:
    """sample: bedrock_invoke_model_stream.py"""
    client = _bedrock_client()
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": MAX_TOKENS,
        "temperature": TEMPERATURE,
        "system": system,
        "messages": [
            {"role": m["role"], "content": _anthropic_content_blocks(m)}
            for m in _chat_messages(messages)
        ],
    }
    response = client.invoke_model_with_response_stream(
        modelId=BEDROCK_MODEL_ID, body=json.dumps(body)
    )
    parts = []
    for event in response["body"]:
        chunk = event.get("chunk", {})
        if not chunk:
            continue
        data = json.loads(chunk["bytes"])
        # native Anthropic streaming shape (direct Bedrock)
        if data.get("type") == "content_block_delta":
            parts.append(data.get("delta", {}).get("text", ""))
        # Converse-shaped delta (Singulr proxy)
        elif "contentBlockDelta" in data:
            parts.append(data["contentBlockDelta"]["delta"].get("text", ""))
    return "".join(parts)


# --------------------------------------------------------------------------- #
# Bedrock Agent Runtime techniques (bedrock-agent-runtime client).
# These take a single input string and need extra ids in .env; a missing id
# raises a clear error that surfaces to the UI as a 502.
# --------------------------------------------------------------------------- #
def _require_env(*names: str) -> None:
    missing = [n for n in names if not os.getenv(n)]
    if missing:
        raise RuntimeError(f"Set {', '.join(missing)} in .env to use this technique")


def call_bedrock_invoke_agent(messages: list[dict], system: str) -> str:
    """sample: bedrock_invoke_agent.py"""
    _require_env("BEDROCK_AGENT_ID", "BEDROCK_AGENT_ALIAS_ID")
    client = _agent_runtime_client()
    response = client.invoke_agent(
        agentId=os.getenv("BEDROCK_AGENT_ID"),
        agentAliasId=os.getenv("BEDROCK_AGENT_ALIAS_ID"),
        sessionId=AGENT_SESSION_ID,
        inputText=_latest_user_text(messages),
    )
    parts = [
        event["chunk"]["bytes"].decode()
        for event in response["completion"]
        if event.get("chunk")
    ]
    return "".join(parts)


def call_bedrock_invoke_inline_agent(messages: list[dict], system: str) -> str:
    """sample: bedrock_invoke_inline_agent.py"""
    client = _agent_runtime_client()
    response = client.invoke_inline_agent(
        foundationModel=BEDROCK_MODEL_ID,
        instruction=system,
        sessionId=AGENT_SESSION_ID,
        inputText=_latest_user_text(messages),
    )
    parts = [
        event["chunk"]["bytes"].decode()
        for event in response["completion"]
        if event.get("chunk")
    ]
    return "".join(parts)


def call_bedrock_invoke_flow(messages: list[dict], system: str) -> str:
    """sample: bedrock_invoke_flow.py"""
    _require_env("BEDROCK_FLOW_ID", "BEDROCK_FLOW_ALIAS_ID")
    client = _agent_runtime_client()
    response = client.invoke_flow(
        flowIdentifier=os.getenv("BEDROCK_FLOW_ID"),
        flowAliasIdentifier=os.getenv("BEDROCK_FLOW_ALIAS_ID"),
        inputs=[
            {
                "content": {"document": _latest_user_text(messages)},
                "nodeName": "FlowInputNode",
                "nodeOutputName": "document",
            }
        ],
    )
    parts = []
    for event in response.get("responseStream", []):
        if "flowOutputEvent" in event:
            doc = event["flowOutputEvent"].get("content", {}).get("document", "")
            parts.append(doc if isinstance(doc, str) else json.dumps(doc))
    return "".join(parts)


def call_bedrock_retrieve_and_generate(messages: list[dict], system: str) -> str:
    """sample: bedrock_retrieve_and_generate.py (Knowledge Base RAG)"""
    _require_env("BEDROCK_KNOWLEDGE_BASE_ID")
    client = _agent_runtime_client()
    try:
        response = client.retrieve_and_generate(
            input={"text": _latest_user_text(messages)},
            retrieveAndGenerateConfiguration={
                "type": "KNOWLEDGE_BASE",
                "knowledgeBaseConfiguration": {
                    "knowledgeBaseId": os.getenv("BEDROCK_KNOWLEDGE_BASE_ID"),
                    "modelArn": _rag_model_arn(),
                    "retrievalConfiguration": {
                        "vectorSearchConfiguration": {
                            "numberOfResults": RAG_NUMBER_OF_RESULTS
                        }
                    },
                },
            },
        )
        return response["output"]["text"]
    except Exception as e:
        return str(e)


# --------------------------------------------------------------------------- #
# Registry
# --------------------------------------------------------------------------- #
# Ordered: id -> {label, call}. `label` is what the UI dropdown shows.
PROVIDERS: dict[str, dict] = {
    "groq": {
        "label": "Groq · HTTPX Chat Completions",
        "call": call_groq,
    },
    "bedrock_converse": {
        "label": "Bedrock · Converse (boto3)",
        "call": call_bedrock_converse,
        "supports_files": True,
        "file_accept": CONVERSE_FILE_ACCEPT,
    },
    "bedrock_invoke_model": {
        "label": "Bedrock · InvokeModel (boto3)",
        "call": call_bedrock_invoke_model,
        "supports_files": True,
        "file_accept": INVOKE_FILE_ACCEPT,
    },
    "anthropic_sdk": {
        "label": "Anthropic SDK",
        "call": call_anthropic_sdk,
    },
    "openai_sdk": {
        "label": "OpenAI SDK",
        "call": call_openai_sdk,
    },
    "langchain_bedrock": {
        "label": "LangChain · Bedrock",
        "call": call_langchain_bedrock,
    },
    "langchain_anthropic": {
        "label": "LangChain · Anthropic",
        "call": call_langchain_anthropic,
    },
    "langchain_openai": {
        "label": "LangChain · OpenAI",
        "call": call_langchain_openai,
    },
    "bedrock_converse_stream": {
        "label": "Bedrock · Converse Stream (boto3)",
        "call": call_bedrock_converse_stream,
        "supports_files": True,
        "file_accept": CONVERSE_FILE_ACCEPT,
    },
    "bedrock_invoke_model_stream": {
        "label": "Bedrock · InvokeModel Stream (boto3)",
        "call": call_bedrock_invoke_model_stream,
        "supports_files": True,
        "file_accept": INVOKE_FILE_ACCEPT,
    },
    "bedrock_invoke_agent": {
        "label": "Bedrock Agent · InvokeAgent",
        "call": call_bedrock_invoke_agent,
    },
    "bedrock_invoke_inline_agent": {
        "label": "Bedrock Agent · InvokeInlineAgent",
        "call": call_bedrock_invoke_inline_agent,
    },
    "bedrock_invoke_flow": {
        "label": "Bedrock Agent · InvokeFlow",
        "call": call_bedrock_invoke_flow,
    },
    "bedrock_retrieve_and_generate": {
        "label": "Bedrock Agent · Retrieve & Generate (KB RAG)",
        "call": call_bedrock_retrieve_and_generate,
    },
}

DEFAULT_PROVIDER = "bedrock_converse"


def _guardrail_block_message(exc: Exception) -> str | None:
    """If an exception is actually a Singulr guardrail block, return its text.

    Non-streaming Bedrock calls return the block as response text, but streaming
    and agent-runtime calls raise it as an AccessDeniedException. Detect that
    case so the UI shows the block as the assistant's reply instead of a 502.
    Real IAM/AccessDenied errors (no "[Blocked" marker) still propagate.
    """
    msg = str(exc)
    idx = msg.find("[Blocked")
    return msg[idx:] if idx != -1 else None


def resolve_provider(provider: str | None):
    """Return the call() for `provider`, falling back to the default.

    The call is wrapped so a guardrail block surfaces as normal reply text
    regardless of which SDK technique raised it.
    """
    entry = PROVIDERS.get(provider or DEFAULT_PROVIDER) or PROVIDERS[DEFAULT_PROVIDER]
    call = entry["call"]

    def guarded(messages: list[dict], system: str) -> str:
        try:
            return call(messages, system)
        except Exception as exc:
            blocked = _guardrail_block_message(exc)
            if blocked is not None:
                return blocked
            raise

    return guarded


def list_providers() -> list[dict]:
    """Lightweight metadata for the UI dropdown."""
    return [
        {
            "id": pid,
            "label": meta["label"],
            "supports_files": bool(meta.get("supports_files")),
            **({"file_accept": meta["file_accept"]} if meta.get("file_accept") else {}),
        }
        for pid, meta in PROVIDERS.items()
    ]