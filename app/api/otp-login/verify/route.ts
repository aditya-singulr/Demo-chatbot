import { NextRequest } from "next/server";
import { proxyOtpJson } from "@/lib/otp-login-proxy";

export async function POST(request: NextRequest) {
  try {
    return await proxyOtpJson(request, "/api/otp-login/verify", {
      method: "POST",
      body: await request.json(),
    });
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
}
