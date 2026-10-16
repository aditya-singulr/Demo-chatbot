/**
 * Okta authentication utilities for frontend.
 *
 * Uses Okta's Primary Authentication API: username/password on this app,
 * session ID stored in a first-party cookie for backend verification.
 */

export const OKTA_DOMAIN =
  process.env.NEXT_PUBLIC_OKTA_DOMAIN || "singulr.okta.com";
export const SESSION_COOKIE_NAME =
  process.env.NEXT_PUBLIC_OKTA_SESSION_COOKIE_NAME || "okta_session";

export type OktaAuthResponse = {
  status: "SUCCESS" | "MFA_REQUIRED" | "LOCKED_OUT" | "PASSWORD_EXPIRED" | string;
  sessionToken?: string;
  expiresAt?: string;
  _embedded?: {
    user?: {
      id: string;
      profile: {
        login: string;
        firstName?: string;
        lastName?: string;
      };
    };
  };
  errorCode?: string;
  errorSummary?: string;
};

export type OktaSession = {
  id: string;
  login: string;
  userId: string;
  status: "ACTIVE" | "MFA_REQUIRED" | "MFA_ENROLL" | string;
  expiresAt: string;
};

export type OktaUser = {
  id: string;
  login: string;
  firstName?: string;
  lastName?: string;
};

export async function primaryAuth(
  username: string,
  password: string,
): Promise<OktaAuthResponse> {
  const response = await fetch(`https://${OKTA_DOMAIN}/api/v1/authn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.errorSummary || "Authentication failed");
  }

  return data;
}

export async function createSession(sessionToken: string): Promise<OktaSession> {
  const response = await fetch(`https://${OKTA_DOMAIN}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionToken }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.errorSummary || "Failed to create session");
  }

  return data;
}

export function setSessionCookie(sessionId: string, expiresAt: string): void {
  const expires = new Date(expiresAt).toUTCString();
  document.cookie = `${SESSION_COOKIE_NAME}=${sessionId}; path=/; expires=${expires}; SameSite=Lax`;
}

export function getSessionCookie(): string | null {
  const match = document.cookie.match(
    new RegExp(`(^| )${SESSION_COOKIE_NAME}=([^;]+)`),
  );
  return match ? match[2] : null;
}

export function clearSessionCookie(): void {
  document.cookie = `${SESSION_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export async function login(
  username: string,
  password: string,
): Promise<{ session: OktaSession; user: OktaUser }> {
  const authResponse = await primaryAuth(username, password);

  if (authResponse.status !== "SUCCESS") {
    throw new Error(`Authentication status: ${authResponse.status}`);
  }

  if (!authResponse.sessionToken) {
    throw new Error("No session token received");
  }

  const session = await createSession(authResponse.sessionToken);
  setSessionCookie(session.id, session.expiresAt);

  const user: OktaUser = {
    id: session.userId,
    login: session.login,
    firstName: authResponse._embedded?.user?.profile?.firstName,
    lastName: authResponse._embedded?.user?.profile?.lastName,
  };

  return { session, user };
}

export async function checkAuthStatus(): Promise<{
  authenticated: boolean;
  login?: string;
  email?: string;
}> {
  try {
    const res = await fetch("/api/auth/check", { credentials: "include" });
    if (res.ok) {
      return await res.json();
    }
    return { authenticated: false };
  } catch {
    return { authenticated: false };
  }
}

export function logout(): void {
  clearSessionCookie();
  const returnUrl = `${window.location.origin}/auth`;
  window.location.href = `https://${OKTA_DOMAIN}/login/signout?fromURI=${encodeURIComponent(returnUrl)}`;
}

/*
 * --- PKCE redirect flow (disabled) ---
 *
 * export const OKTA_CLIENT_ID = "0oa26y1wj6p5lppaj1d8";
 * export async function initiateLogin(): Promise<void> { ... }
 * export async function handleCallback(code: string, state: string): Promise<...> { ... }
 * export function hasValidTokens(): boolean { ... }
 * export function getAccessToken(): string | null { ... }
 */
