import { NextRequest, NextResponse } from "next/server";

const BACKEND_WITHOUT_GUARDRAIL =
  process.env.BACKEND_WITHOUT_GUARDRAIL ?? "http://localhost:8000";
const BACKEND_WITH_GUARDRAIL =
  process.env.BACKEND_WITH_GUARDRAIL ?? "http://localhost:8001";

export async function POST(req: NextRequest) {
  try {
    const { messages, mode, provider } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const pyMessages = messages.filter(
      (m: { content: string }) => m.content != null && m.content !== ""
    );

    const backendUrl =
      mode === "guardrail" ? BACKEND_WITH_GUARDRAIL : BACKEND_WITHOUT_GUARDRAIL;

    const pyRes = await fetch(`${backendUrl}/api/ui`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: pyMessages, provider }),
    });

    if (!pyRes.ok) {
      const err = await pyRes.text();
      console.error("Python backend error:", err);
      return NextResponse.json(
        { error: "Failed to get response from Python backend" },
        { status: 502 }
      );
    }

    return NextResponse.json(await pyRes.json());
  } catch (error) {
    console.error("UI chat error:", error);
    return NextResponse.json(
      { error: "Failed to get response" },
      { status: 500 }
    );
  }
}
