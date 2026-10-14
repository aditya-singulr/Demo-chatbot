import type { NextRequest } from "next/server";

export const STANDARD_OKTA_SESSION_COOKIE =
  "novapay_standard_okta_access_token";

type OktaUserInfo = {
  sub?: string;
  email?: string;
  name?: string;
};

function getOktaDomain(): string {
  return (
    process.env.OKTA_DOMAIN ??
    process.env.NEXT_PUBLIC_STANDARD_OKTA_DOMAIN ??
    "singulr.okta.com"
  );
}

export function getStandardSessionAccessToken(
  request: NextRequest,
): string | null {
  return request.cookies.get(STANDARD_OKTA_SESSION_COOKIE)?.value ?? null;
}

export function getStandardSessionAuthorization(
  request: NextRequest,
): string | null {
  const token = getStandardSessionAccessToken(request);
  return token ? `Bearer ${token}` : null;
}

export async function validateStandardOktaAccessToken(
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

export function standardSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 3600,
  };
}
