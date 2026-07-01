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
"""
import json
import os
import re

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
def _chat_messages(messages: list[dict]) -> list[dict]:
    """Keep only user/assistant turns as {role, content} plain dicts."""
    return [
        {"role": m["role"], "content": m["content"]}
        for m in messages
        if m["role"] in ("user", "assistant")
    ]


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
            {"role": m["role"], "content": [{"text": m["content"]}]}
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
            {"role": m["role"], "content": [{"type": "text", "text": m["content"]}]}
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
            {"role": m["role"], "content": [{"text": m["content"]}]}
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
            {"role": m["role"], "content": [{"type": "text", "text": m["content"]}]}
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
    },
    "bedrock_invoke_model": {
        "label": "Bedrock · InvokeModel (boto3)",
        "call": call_bedrock_invoke_model,
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
    },
    "bedrock_invoke_model_stream": {
        "label": "Bedrock · InvokeModel Stream (boto3)",
        "call": call_bedrock_invoke_model_stream,
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
    return [{"id": pid, "label": meta["label"]} for pid, meta in PROVIDERS.items()]