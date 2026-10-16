import { NextRequest } from "next/server";
import { proxyAuthenticatedChat } from "@/lib/auth-proxy";

export async function POST(req: NextRequest) {
  return proxyAuthenticatedChat(req, "/api/auth/ui");
}
