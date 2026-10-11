import { NextRequest, NextResponse } from "next/server";
import { getBackendUrls } from "@/lib/backends";

type ProxyOptions = {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
};

export async function proxyOtpJson(
  request: NextRequest,
  path: string,
  { method = "GET", body, timeoutMs = 15000 }: ProxyOptions = {},
) {
  const { withOtpLogin } = getBackendUrls();
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("Cookie", cookie);
  if (body !== undefined) headers.set("Content-Type", "application/json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await fetch(`${withOtpLogin}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const responseBody = await upstream.text();
    const response = new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) response.headers.set("set-cookie", setCookie);
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Backend request timed out" }, { status: 504 });
    }
    console.error("OTP login backend proxy error:", error);
    return NextResponse.json({ error: "Failed to reach OTP login backend" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
