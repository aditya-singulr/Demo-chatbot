import { NextRequest, NextResponse } from "next/server";
import { proxyOtpJson } from "@/lib/otp-login-proxy";

export async function POST(request: NextRequest) {
  try {
    const { messages, provider } = await request.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const filteredMessages = messages.filter(
      (message: { content?: string; attachments?: unknown[] }) =>
        (message.content != null && message.content !== "") ||
        (Array.isArray(message.attachments) && message.attachments.length > 0),
    );
    const hasAttachments = filteredMessages.some(
      (message: { attachments?: unknown[] }) =>
        Array.isArray(message.attachments) && message.attachments.length > 0,
    );
    const timeoutMs =
      Number(process.env.UI_BACKEND_TIMEOUT_MS) || (hasAttachments ? 60000 : 15000);

    return await proxyOtpJson(
      request,
      "/api/ui",
      {
        method: "POST",
        body: { messages: filteredMessages, provider },
        timeoutMs,
      },
    );
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
