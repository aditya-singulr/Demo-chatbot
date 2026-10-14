import { NextRequest, NextResponse } from "next/server";
import { getBackendUrls } from "@/lib/backends";
import { requireOktaBearer, unauthorized } from "@/lib/okta-api";

const FALLBACK = [{ id: "gpt-4o", label: "gpt-4o" }];

export async function GET(req: NextRequest) {
  const authHeader = requireOktaBearer(req);
  if (authHeader instanceof NextResponse) return authHeader;

  const { withGuardrailLitellm } = getBackendUrls();

  try {
    const res = await fetch(`${withGuardrailLitellm}/api/providers`, {
      cache: "no-store",
      headers: { Authorization: authHeader },
    });
    if (res.status === 401) return unauthorized();
    if (!res.ok) throw new Error(`backend ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({
      providers: FALLBACK,
      default: FALLBACK[0].id,
    });
  }
}
