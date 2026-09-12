/**
 * Okta authentication utilities for frontend.
 *
 * Uses Okta's Primary Authentication API + redirect flow.
 * After /authn, redirects to Okta to set the session cookie.
 */

export const OKTA_DOMAIN = process.env.NEXT_PUBLIC_OKTA_DOMAIN || "singulr.okta.com";
export const SESSION_COOKIE_NAME = process.env.NEXT_PUBLIC_OKTA_SESSION_COOKIE_NAME || "sid";

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
 * Redirect to Okta to set session cookie.
 * After this, Okta redirects back to redirectUrl with the sid cookie set.
 */
export function redirectToOktaSession(sessionToken: string, redirectUrl: string): void {
  const url = `https://${OKTA_DOMAIN}/login/sessionCookieRedirect?token=${encodeURIComponent(sessionToken)}&redirectUrl=${encodeURIComponent(redirectUrl)}`;
  window.location.href = url;
}

/**
 * Full login flow: authenticate and redirect to Okta for cookie.
 */
export async function login(
  username: string,
  password: string,
  redirectUrl: string
): Promise<void> {
  const authResponse = await primaryAuth(username, password);

  if (authResponse.status !== "SUCCESS") {
    throw new Error(`Authentication status: ${authResponse.status}`);
  }

  if (!authResponse.sessionToken) {
    throw new Error("No session token received");
  }

  // Redirect to Okta to set the session cookie
  redirectToOktaSession(authResponse.sessionToken, redirectUrl);
}

/**
 * Check if user has Okta session by calling backend.
 * The sid cookie is HttpOnly so we can't check it directly.
 */
export async function checkAuthStatus(): Promise<{ authenticated: boolean; login?: string }> {
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

/**
 * Logout: redirect to Okta logout or just clear local state.
 */
export function logout(): void {
  // Redirect to Okta logout to clear the sid cookie
  const returnUrl = window.location.origin + "/auth";
  window.location.href = `https://${OKTA_DOMAIN}/login/signout?fromURI=${encodeURIComponent(returnUrl)}`;
}
