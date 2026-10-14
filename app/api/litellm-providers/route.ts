import { NextRequest, NextResponse } from "next/server";
import { getBackendUrls } from "@/lib/backends";
import { getSessionAuthorization } from "@/lib/okta-session";

const FALLBACK = [{ id: "gpt-4o", label: "gpt-4o" }];

export async function GET(request: NextRequest) {
  const { withGuardrailLitellm } = getBackendUrls();
  const sessionAuthorization = getSessionAuthorization(request);

  if (!sessionAuthorization) {
    return NextResponse.json(
      { error: "Authentication required", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  try {
    const res = await fetch(`${withGuardrailLitellm}/api/providers`, {
      headers: { Authorization: sessionAuthorization },
      cache: "no-store",
    });
    if (res.status === 401) {
      return NextResponse.json(
        { error: "Authentication required", code: "AUTH_REQUIRED" },
        { status: 401 },
      );
    }
    if (!res.ok) throw new Error(`backend ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({
      providers: FALLBACK,
      default: FALLBACK[0].id,
    });
  }
}
