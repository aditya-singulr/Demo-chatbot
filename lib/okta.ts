/**
 * Okta authentication utilities for frontend.
 *
 * Uses Okta's Primary Authentication API for direct login flow.
 * Session ID is stored in a cookie for backend verification.
 */

export const OKTA_DOMAIN = process.env.NEXT_PUBLIC_OKTA_DOMAIN || "singulr.okta.com";
export const SESSION_COOKIE_NAME = process.env.NEXT_PUBLIC_OKTA_SESSION_COOKIE_NAME || "okta_session";

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
  cookieToken?: string;
};

export type OktaUser = {
  id: string;
  login: string;
  firstName?: string;
  lastName?: string;
};

/**
 * Authenticate with Okta using username and password.
 * Returns session token on success.
 */
export async function primaryAuth(
  username: string,
  password: string
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

/**
 * Exchange session token for a full session.
 * Returns session ID that can be used for cookie-based auth.
 */
export async function createSession(sessionToken: string): Promise<OktaSession> {
  const response = await fetch(
    `https://${OKTA_DOMAIN}/api/v1/sessions?additionalFields=cookieToken`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.errorSummary || "Failed to create session");
  }

  return data;
}

/**
 * Store session ID in a cookie.
 */
export function setSessionCookie(sessionId: string, expiresAt: string): void {
  const expires = new Date(expiresAt).toUTCString();
  document.cookie = `${SESSION_COOKIE_NAME}=${sessionId}; path=/; expires=${expires}; SameSite=Lax`;
}

/**
 * Get session ID from cookie.
 */
export function getSessionCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${SESSION_COOKIE_NAME}=([^;]+)`));
  return match ? match[2] : null;
}

/**
 * Clear session cookie.
 */
export function clearSessionCookie(): void {
  document.cookie = `${SESSION_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * Full login flow: authenticate and create session.
 */
export async function login(
  username: string,
  password: string
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

/**
 * Logout: clear session cookie.
 * Optionally revoke session with Okta (requires backend call).
 */
export function logout(): void {
  clearSessionCookie();
}

/**
 * Check if user has a session cookie.
 */
export function hasSession(): boolean {
  return !!getSessionCookie();
}
