import type { NextRequest } from "next/server";

export const OKTA_SESSION_COOKIE = "novapay_okta_access_token";

type OktaUserInfo = {
  sub?: string;
  email?: string;
  name?: string;
};

function getOktaDomain(): string {
  return process.env.OKTA_DOMAIN ?? process.env.NEXT_PUBLIC_OKTA_DOMAIN ?? "singulr.okta.com";
}

export function getSessionAccessToken(request: NextRequest): string | null {
  return request.cookies.get(OKTA_SESSION_COOKIE)?.value ?? null;
}

export function getSessionAuthorization(request: NextRequest): string | null {
  const token = getSessionAccessToken(request);
  return token ? `Bearer ${token}` : null;
}

export async function validateOktaAccessToken(
  accessToken: string,
): Promise<OktaUserInfo | null> {
  try {
    const response = await fetch(`https://${getOktaDomain()}/oauth2/v1/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (!response.ok) return null;
    return (await response.json()) as OktaUserInfo;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 3600,
  };
}
