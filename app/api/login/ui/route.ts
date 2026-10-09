import { NextRequest, NextResponse } from "next/server";
import { getBackendUrls } from "@/lib/backends";

export async function POST(req: NextRequest) {
  const { withLogin } = getBackendUrls();

  try {
    const { messages, provider } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const pyMessages = messages.filter(
      (m: { content?: string; attachments?: unknown[] }) =>
        (m.content != null && m.content !== "") ||
        (Array.isArray(m.attachments) && m.attachments.length > 0)
    );
    const hasAttachments = pyMessages.some(
      (m: { attachments?: unknown[] }) =>
        Array.isArray(m.attachments) && m.attachments.length > 0
    );
    const TIMEOUT_MS =
      Number(process.env.UI_BACKEND_TIMEOUT_MS) || (hasAttachments ? 60000 : 15000);

    const authHeader = req.headers.get("authorization") || "";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const pyRes = await fetch(`${withLogin}/api/ui`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({ messages: pyMessages, provider }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!pyRes.ok) {
      const body = await pyRes.text().catch(() => "");

      if (pyRes.status === 401) {
        return NextResponse.json(
          { error: "Authentication required", code: "AUTH_REQUIRED" },
          { status: 401 }
        );
      }

      console.error("Login chat backend error", {
        backendUrl: withLogin,
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

    let data: unknown;
    try {
      data = await pyRes.json();
    } catch {
      return NextResponse.json({ error: "Invalid response from backend" }, { status: 502 });
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Backend request timed out" }, { status: 504 });
    }
    console.error("Login UI chat error:", error);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
