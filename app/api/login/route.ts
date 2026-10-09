import { NextRequest, NextResponse } from "next/server";
import { getBackendUrls } from "@/lib/backends";

export async function POST(req: NextRequest) {
  const { withLogin } = getBackendUrls();

  try {
    const body = await req.json();
    const pyRes = await fetch(`${withLogin}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await pyRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: pyRes.status });
  } catch (error) {
    console.error("Login proxy error:", error);
    return NextResponse.json({ error: "Failed to reach login backend" }, { status: 502 });
  }
}
