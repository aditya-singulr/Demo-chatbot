import { NextRequest, NextResponse } from "next/server";

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const { messages, mode } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const chatMode = mode === "bedrock" ? "bedrock" : "python";
    const pyMessages = messages.filter(
      (m: { content: string }) => m.content != null && m.content !== ""
    );

    const pyRes = await fetch(`${PYTHON_BACKEND_URL}/api/ui`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: pyMessages, mode: chatMode }),
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
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
