# Aria — NovaPay Support Chatbot

A fictional customer support chatbot for red teaming tests. The UI is a Next.js app; model calls are handled by Python FastAPI backends (with and without Singulr guardrails).

## Architecture

| Component | Entrypoint | Default port env var |
|---|---|---|
| UI | `scripts/start-ui.mjs` | `UI_PORT` (3000) |
| Backend — no guardrail | `python-chatbot/main.py` | `BACKEND_PORT_NO_GUARDRAIL` (8000) |
| Backend — Singulr SDK guardrail | `python-chatbot/main_guardrail.py` | `BACKEND_PORT_GUARDRAIL` (8001) |
| Backend — LiteLLM guardrail | `python-chatbot/main_guardrail_litellm.py` | `BACKEND_PORT_GUARDRAIL_LITELLM` (8002) |

All processes read config from a **single env file** passed via `--env-file`. See `python-chatbot/.env.example`.

---

## Environment variables

Copy the example file and fill in your values:

```bash
cp python-chatbot/.env.example python-chatbot/.env
```

### Ports & networking

| Variable | Required | Used by | Description |
|---|---|---|---|
| `UI_PORT` | No | UI | Port Next.js listens on (default `3000`) |
| `BACKEND_PORT_NO_GUARDRAIL` | No | `main.py`, UI | Port for the no-guardrail backend (default `8000`) |
| `BACKEND_PORT_GUARDRAIL` | No | `main_guardrail.py`, UI | Port for the Singulr SDK backend (default `8001`) |
| `BACKEND_PORT_GUARDRAIL_LITELLM` | No | `main_guardrail_litellm.py`, UI | Port for the LiteLLM backend (default `8002`) |
| `BACKEND_BIND_HOST` | No | Python backends | Host to bind on (default `0.0.0.0`) |
| `BACKEND_HOST` | No | UI | Host used when building backend URLs (default `127.0.0.1`) |
| `UI_BACKEND_TIMEOUT_MS` | No | UI | Timeout for UI → backend requests (default `15000`) |

The UI derives backend URLs from `BACKEND_HOST` + the three `BACKEND_PORT_*` vars (e.g. `http://127.0.0.1:8001`). Optional full-URL overrides:

| Variable | Description |
|---|---|
| `BACKEND_WITHOUT_GUARDRAIL` | Override URL for “Without Guardrail” mode |
| `BACKEND_WITH_GUARDRAIL` | Override URL for “With Guardrail” SDK mode |
| `BACKEND_WITH_GUARDRAIL_LITELLM` | Override URL for LiteLLM mode |

### Singulr guardrail (required for guardrail backends)

| Variable | Required | Description |
|---|---|---|
| `SINGULR_GATEWAY_BASE_URL` | Yes* | Singulr AI platform gateway URL |
| `SINGULR_GATEWAY_TOKEN` | Yes* | Gateway auth token |
| `SINGULR_GUARDRAIL_ID` | Yes* | Guardrail ID |
| `SINGULR_ENFORCEMENT_ENTITY_ID` | Yes* | Enforcement entity ID |

\*Required when running `main_guardrail.py` or `main_guardrail_litellm.py`.

### AWS / model providers

| Variable | Required | Description |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | Yes** | AWS credentials for Bedrock |
| `AWS_SECRET_ACCESS_KEY` | Yes** | AWS credentials for Bedrock |
| `AWS_DEFAULT_REGION` | No | AWS region (default `us-east-1`) |
| `AWS_REGION` | No | Alias for region (used by some providers) |
| `BEDROCK_MODEL_ID` | No | Bedrock model ID |
| `ANTHROPIC_API_KEY` | No | Anthropic SDK provider |
| `OPENAI_API_KEY` | No | OpenAI SDK provider |
| `GROQ_API_KEY` | No | Groq provider |

\*\*Required for Bedrock-based providers.

### LiteLLM backend (`main_guardrail_litellm.py`)

| Variable | Required | Description |
|---|---|---|
| `LITELLM_BASE_URL` | No | LiteLLM proxy URL |
| `LITELLM_API_KEY` | No | LiteLLM proxy API key |
| `LITELLM_DEFAULT_MODEL` | No | Default model on the proxy (default `gpt-4o`) |

### API auth

| Variable | Required | Description |
|---|---|---|
| `CHATBOT_API_KEY` | No | If set, `POST /api/chat` requires this token |

### Bedrock agents / RAG (optional providers)

Only needed if you use the corresponding SDK technique in the provider dropdown:

`BEDROCK_AGENT_ID`, `BEDROCK_AGENT_ALIAS_ID`, `BEDROCK_FLOW_ID`, `BEDROCK_FLOW_ALIAS_ID`, `BEDROCK_KNOWLEDGE_BASE_ID`, `BEDROCK_RAG_MODEL_ARN`, etc.

---

## Running locally

### All-in-one (recommended)

Starts all three Python backends and the UI using `python-chatbot/.env`:

```bash
./dev.sh
```

Open the URL shown in the terminal (port comes from `UI_PORT` in your env file).

### Python backends (individual)

From `python-chatbot/`, with venv activated:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python main.py --env-file .env
python main_guardrail.py --env-file .env
python main_guardrail_litellm.py --env-file .env
```

Each script reads its port from the matching `BACKEND_PORT_*` variable in the env file.

### UI (individual)

From the project root:

```bash
npm install

# Development
node scripts/start-ui.mjs --env-file python-chatbot/.env

# Or via npm script (uses python-chatbot/.env by default)
npm run dev:ui
```

Only one `next dev` instance can run per project directory. Stop any existing dev server before starting another.

---

## Running on EC2 (multiple instances with screen)

Use **`--prod`** (`next start`) to run multiple UI instances on different ports. Build once, then start each stack in its own screen session with a separate env file.

### One-time setup

```bash
cd /path/to/Demo-chatbot
npm install && npm run build
cd python-chatbot
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### Instance 1

Create `python-chatbot/.env.instance1`:

```bash
UI_PORT=3001
BACKEND_PORT_GUARDRAIL=8001
BACKEND_HOST=127.0.0.1
SINGULR_GATEWAY_BASE_URL=...
# ... other keys
```

```bash
screen -S backend-1
cd python-chatbot && source .venv/bin/activate
python main_guardrail.py --env-file .env.instance1
# Ctrl+A, D to detach

screen -S ui-1
cd /path/to/Demo-chatbot
node scripts/start-ui.mjs --env-file python-chatbot/.env.instance1 --prod
# Ctrl+A, D to detach
```

### Instance 2

Same pattern with `.env.instance2`, different `UI_PORT`, `BACKEND_PORT_GUARDRAIL`, and Singulr credentials.

Open `http://<ec2-ip>:3001` and `http://<ec2-ip>:3002`. Ensure your security group allows the UI and backend ports you use.

---

## Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /` | None | Aria chat UI |
| `POST /api/ui` | None | Used by the browser UI (proxies to Python backend) |
| `POST /api/chat` | `api-key` or `Authorization: Bearer` header | Red teaming target endpoint |
| `GET /api/providers` | None | SDK provider list for the UI dropdown |
| `GET /health` | None | Backend health check (Python) |

---

## Singulr Red Teaming Target Configuration

### Basic Fields

| Field | Value |
|---|---|
| Target Type | AI Chatbot |
| API Key | your `CHATBOT_API_KEY` value |
| Model ID | your Bedrock / provider model ID |
| HTTP Endpoint | `https://<your-host>/api/chat` |

### HTTP Request Template

```
POST {url} HTTP/1.1
api-key: {api_key}
Content-Type: application/json

{
  "messages": [{
    "role": "user",
    "content": "{{PROMPT}}"
  }],
  "temperature": 0.7,
  "max_tokens": 8192,
  "top_p": 1.0
}
```

### HTTP Response Template

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1720000000,
  "model": "claude-sonnet-4-6",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "{{COMPLETION}}"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 85,
    "total_tokens": 110
  }
}
```
