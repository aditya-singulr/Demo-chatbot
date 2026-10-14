import { NextRequest, NextResponse } from "next/server";
import { getBackendUrls } from "@/lib/backends";
import { requireAuth } from "@/lib/auth-guard";

const FALLBACK = [{ id: "gpt-4o", label: "gpt-4o" }];

export async function GET(req: NextRequest) {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const { withGuardrailLitellm } = getBackendUrls();

  try {
    const res = await fetch(`${withGuardrailLitellm}/api/providers`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`backend ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({
      providers: FALLBACK,
      default: FALLBACK[0].id,
    });
  }
}
