import { NextRequest, NextResponse } from "next/server";
import { getBackendUrls } from "@/lib/backends";

export async function POST(req: NextRequest) {
  const { withAuth } = getBackendUrls();

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

    // Forward cookies for auth
    const cookieHeader = req.headers.get("cookie") || "";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const pyRes = await fetch(`${withAuth}/api/ui`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ messages: pyMessages, provider }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!pyRes.ok) {
      const body = await pyRes.text().catch(() => "");

      // Handle 401 specifically for auth flow
      if (pyRes.status === 401) {
        return NextResponse.json(
          { error: "Authentication required", code: "AUTH_REQUIRED" },
          { status: 401 }
        );
      }

      console.error("Python backend error", {
        backendUrl: withAuth,
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
      const text = await pyRes.text().catch(() => "");
      console.error("Python backend returned invalid JSON", { status: pyRes.status, text });
      return NextResponse.json({ error: "Invalid response from backend" }, { status: 502 });
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Backend request timed out");
      return NextResponse.json({ error: "Backend request timed out" }, { status: 504 });
    }
    console.error("Auth UI chat error:", error);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
