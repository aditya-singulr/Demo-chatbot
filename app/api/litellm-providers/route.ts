import { NextResponse } from "next/server";

const BACKEND_WITH_GUARDRAIL_LITELLM =
  process.env.BACKEND_WITH_GUARDRAIL_LITELLM ?? "http://localhost:8002";

const FALLBACK = [{ id: "gpt-4o", label: "gpt-4o" }];

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_WITH_GUARDRAIL_LITELLM}/api/providers`, {
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
