import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password, grant_type } = body;

    const expectedUser = process.env.AUTH_USERNAME ?? "admin";
    const expectedPass = process.env.AUTH_PASSWORD ?? "novapay";

    if (username !== expectedUser || password !== expectedPass) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    return NextResponse.json({
      access_token: process.env.CHATBOT_API_KEY ?? "nv-redteam-2024-xK9mPqL3vR7wZj5t",
      token_type: "Bearer",
      expires_in: 3600,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
