import { NextRequest, NextResponse } from "next/server";
import { getBackendUrls } from "@/lib/backends";

export async function GET(req: NextRequest) {
  const { withAuth } = getBackendUrls();

  try {
    // Forward cookies to backend
    const cookieHeader = req.headers.get("cookie") || "";

    const pyRes = await fetch(`${withAuth}/api/auth/check`, {
      method: "GET",
      headers: {
        Cookie: cookieHeader,
      },
    });

    if (!pyRes.ok) {
      return NextResponse.json({ authenticated: false });
    }

    const data = await pyRes.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
