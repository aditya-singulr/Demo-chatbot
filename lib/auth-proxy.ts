import { NextRequest, NextResponse } from "next/server";
import { getBackendUrls } from "@/lib/backends";

type ProxyOptions = {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  preserveSetCookie?: boolean;
};

export async function proxyAuthenticatedChat(request: NextRequest, path: string) {
  try {
    const body = await request.json();
    if (!body?.messages || !Array.isArray(body.messages)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const messages = body.messages.filter(
      (message: { content?: string; attachments?: unknown[] }) =>
        (message.content != null && message.content !== "") ||
        (Array.isArray(message.attachments) && message.attachments.length > 0),
    );
    const hasAttachments = messages.some(
      (message: { attachments?: unknown[] }) =>
        Array.isArray(message.attachments) && message.attachments.length > 0,
    );
    return proxyAuthenticatedJson(request, path, {
      method: "POST",
      body: { messages, provider: body.provider },
      timeoutMs:
        Number(process.env.UI_BACKEND_TIMEOUT_MS) || (hasAttachments ? 60000 : 15000),
      preserveSetCookie: path.startsWith("/api/otp-login/"),
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function proxyAuthenticatedJson(
  request: NextRequest,
  path: string,
  {
    method = "GET",
    body,
    timeoutMs = 15000,
    preserveSetCookie = false,
  }: ProxyOptions = {},
) {
  const { authenticated } = getBackendUrls();
  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  const cookie = request.headers.get("cookie");
  if (authorization) headers.set("Authorization", authorization);
  if (cookie) headers.set("Cookie", cookie);
  if (body !== undefined) headers.set("Content-Type", "application/json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await fetch(`${authenticated}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const responseBody = await upstream.text();
    const responseHeaders = new Headers({
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    });
    if (preserveSetCookie) {
      const setCookie = upstream.headers.get("set-cookie");
      if (setCookie) responseHeaders.set("set-cookie", setCookie);
    }
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Backend request timed out" }, { status: 504 });
    }
    console.error("Authenticated backend proxy error:", error);
    return NextResponse.json({ error: "Failed to reach authenticated backend" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
