import { NextRequest, NextResponse } from "next/server";

const BACKEND_WITHOUT_GUARDRAIL =
  process.env.BACKEND_WITHOUT_GUARDRAIL ?? "http://localhost:8000";
const BACKEND_WITH_GUARDRAIL =
  process.env.BACKEND_WITH_GUARDRAIL ?? "http://localhost:8001";
const BACKEND_WITH_GUARDRAIL_LITELLM =
  process.env.BACKEND_WITH_GUARDRAIL_LITELLM ?? "http://localhost:8002";

export async function POST(req: NextRequest) {
  const TIMEOUT_MS = Number(process.env.UI_BACKEND_TIMEOUT_MS) || 15000;
  try {
    const { messages, mode, provider } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const pyMessages = messages.filter(
      (m: { content: string }) => m.content != null && m.content !== ""
    );

    const backendUrl =
      mode === "guardrail_litellm"
        ? BACKEND_WITH_GUARDRAIL_LITELLM
        : mode === "guardrail"
        ? BACKEND_WITH_GUARDRAIL
        : BACKEND_WITHOUT_GUARDRAIL;

    // forward selective incoming headers (Authorization, cookies, and any x- headers)
    const incomingHeaders = Object.fromEntries(req.headers as any) as Record<string, string>;
    const forwardHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (incomingHeaders.authorization) forwardHeaders.Authorization = incomingHeaders.authorization;
    if (incomingHeaders.cookie) forwardHeaders.Cookie = incomingHeaders.cookie;
    for (const [k, v] of Object.entries(incomingHeaders)) {
      if (k.startsWith("x-")) forwardHeaders[k] = v;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const pyRes = await fetch(`${backendUrl}/api/ui`, {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify({ messages: pyMessages, provider }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!pyRes.ok) {
      const body = await pyRes.text().catch(() => "");
      console.error("Python backend error", {
        backendUrl,
        status: pyRes.status,
        body,
      });
      const safeBody = process.env.NODE_ENV === "production" ? undefined : body;
      return NextResponse.json(
        {
          error: "Failed to get response from Python backend",
          upstream_status: pyRes.status,
          upstream_body: safeBody,
        },
        { status: pyRes.status }
      );
    }

    // parse JSON robustly
    let data: unknown;
    try {
      data = await pyRes.json();
    } catch (err) {
      const text = await pyRes.text().catch(() => "");
      console.error("Python backend returned invalid JSON", { backendUrl, status: pyRes.status, text });
      return NextResponse.json({ error: "Invalid response from backend" }, { status: 502 });
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Backend request timed out');
      return NextResponse.json({ error: 'Backend request timed out' }, { status: 504 });
    }
    console.error("UI chat error:", error);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
