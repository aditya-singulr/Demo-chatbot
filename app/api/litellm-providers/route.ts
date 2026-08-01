import { NextResponse } from "next/server";
import { getBackendUrls } from "@/lib/backends";

const FALLBACK = [{ id: "gpt-4o", label: "gpt-4o" }];

export async function GET() {
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
