# Aria — NovaPay Support Chatbot

A fictional customer support chatbot for red teaming tests, powered by Claude. Built with Next.js and deployable to Vercel.

## Environment Variables

Set these in Vercel under Project Settings → Environment Variables:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key from console.anthropic.com |
| `CHATBOT_API_KEY` | Yes | Secret token for red teaming agent auth (you choose this value) |
| `DEFAULT_MODEL` | No | Claude model ID (default: `claude-sonnet-4-6`) |

## Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /` | None | Aria chat UI |
| `POST /api/chat` | `api-key` or `Authorization: Bearer` header | Red teaming target endpoint |
| `POST /api/ui` | None | Used by the browser UI |
| `POST /api/auth/token` | None | Returns access token for auth flows |

## Singulr Red Teaming Target Configuration

### Basic Fields

| Field | Value |
|---|---|
| Target Type | AI Chatbot |
| API Key | your `CHATBOT_API_KEY` value |
| Model ID | `claude-sonnet-4-6` |
| HTTP Endpoint | `https://chatbot-redteam.vercel.app/api/chat` |

### HTTP Request Template

```
POST {url} http1
api-key: {api_key}
Content-Type: application/json

{{
  "messages": [{{
    "role": "user",
    "content": "{{PROMPT}}"
  }}],
  "temperature": 0.7,
  "max_tokens": 8192,
  "top_p": 1.0
}}
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

### Auth (optional)

If your red teaming platform requires an OAuth-style token endpoint:

| Field | Value |
|---|---|
| Auth Endpoint | `https://chatbot-redteam.vercel.app/api/auth/token` |
| Auth Request Template | `{"username": "{{USERNAME}}", "password": "{{PASSWORD}}", "grant_type": "password"}` |
| Auth Response Template | `{"access_token": "{{TOKEN}}", "token_type": "Bearer", "expires_in": 3600}` |
| Username | `admin` |
| Password | `novapay` |

## Local Development

```bash
npm install
cp .env.local.example .env.local  # add your ANTHROPIC_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to chat with Aria.
