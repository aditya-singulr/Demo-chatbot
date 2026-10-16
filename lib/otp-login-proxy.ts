import { NextRequest } from "next/server";
import { proxyAuthenticatedJson } from "@/lib/auth-proxy";

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
  return proxyAuthenticatedJson(request, path, {
    method,
    body,
    timeoutMs,
    preserveSetCookie: true,
  });
}
