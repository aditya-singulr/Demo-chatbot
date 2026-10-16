import { NextRequest } from "next/server";
import { proxyAuthenticatedJson } from "@/lib/auth-proxy";

export async function POST(req: NextRequest) {
  try {
    return await proxyAuthenticatedJson(req, "/api/login", {
      method: "POST",
      body: await req.json(),
    });
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
}
