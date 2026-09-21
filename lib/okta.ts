/**
 * Okta OAuth/OIDC utilities for frontend.
 *
 * Implements Authorization Code flow with PKCE for Single-Page Applications.
 */

export const OKTA_DOMAIN = "singulr.okta.com";
export const OKTA_CLIENT_ID = "0oa26y1wj6p5lppaj1d8";
export const OKTA_REDIRECT_URI = typeof window !== "undefined"
  ? `${window.location.origin}/auth/callback`
  : "https://chat-demo-external.singulr.ai/auth/callback";
export const OKTA_LOGOUT_REDIRECT_URI = typeof window !== "undefined"
  ? `${window.location.origin}/auth`
  : "https://chat-demo-external.singulr.ai/auth";

const TOKEN_STORAGE_KEY = "okta_tokens";
const PKCE_STORAGE_KEY = "okta_pkce";

type OktaTokens = {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  expires_at: number; // Unix timestamp when token expires
};

type PKCEData = {
  code_verifier: string;
  state: string;
};

/**
 * Generate a random string for PKCE code_verifier and state.
 */
function generateRandomString(length: number): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => charset[byte % charset.length]).join("");
}

/**
 * Generate SHA-256 hash and base64url encode it for PKCE code_challenge.
 */
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  // Convert to base64url
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Store PKCE data for callback verification.
 */
function storePKCE(data: PKCEData): void {
  sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify(data));
}

/**
 * Retrieve and clear PKCE data.
 */
function retrievePKCE(): PKCEData | null {
  const data = sessionStorage.getItem(PKCE_STORAGE_KEY);
  if (data) {
    sessionStorage.removeItem(PKCE_STORAGE_KEY);
    return JSON.parse(data);
  }
  return null;
}

/**
 * Store tokens in localStorage.
 */
function storeTokens(tokens: OktaTokens): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

/**
 * Retrieve tokens from localStorage.
 */
export function getTokens(): OktaTokens | null {
  const data = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (data) {
    return JSON.parse(data);
  }
  return null;
}

/**
 * Clear stored tokens.
 */
export function clearTokens(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Check if user has valid (non-expired) tokens.
 */
export function hasValidTokens(): boolean {
  const tokens = getTokens();
  if (!tokens) return false;
  // Check if token is expired (with 60s buffer)
  return tokens.expires_at > Date.now() / 1000 + 60;
}

/**
 * Get the access token if valid.
 */
export function getAccessToken(): string | null {
  if (!hasValidTokens()) return null;
  return getTokens()?.access_token ?? null;
}

/**
 * Get the ID token if valid.
 */
export function getIdToken(): string | null {
  if (!hasValidTokens()) return null;
  return getTokens()?.id_token ?? null;
}

/**
 * Initiate OAuth login - redirects to Okta.
 */
export async function initiateLogin(): Promise<void> {
  const codeVerifier = generateRandomString(64);
  const state = generateRandomString(32);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store PKCE data for callback
  storePKCE({ code_verifier: codeVerifier, state });

  const params = new URLSearchParams({
    client_id: OKTA_CLIENT_ID,
    response_type: "code",
    scope: "openid profile email",
    redirect_uri: OKTA_REDIRECT_URI,
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authorizeUrl = `https://${OKTA_DOMAIN}/oauth2/v1/authorize?${params.toString()}`;
  console.log("Redirecting to Okta:", authorizeUrl);
  window.location.href = authorizeUrl;
}

/**
 * Handle OAuth callback - exchange code for tokens.
 */
export async function handleCallback(code: string, state: string): Promise<OktaTokens> {
  const pkce = retrievePKCE();

  if (!pkce) {
    throw new Error("No PKCE data found. Please try logging in again.");
  }

  if (pkce.state !== state) {
    throw new Error("State mismatch. Possible CSRF attack.");
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: OKTA_CLIENT_ID,
    redirect_uri: OKTA_REDIRECT_URI,
    code: code,
    code_verifier: pkce.code_verifier,
  });

  const response = await fetch(`https://${OKTA_DOMAIN}/oauth2/v1/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || "Failed to exchange code for tokens");
  }

  const tokenResponse = await response.json();

  const tokens: OktaTokens = {
    ...tokenResponse,
    expires_at: Math.floor(Date.now() / 1000) + tokenResponse.expires_in,
  };

  storeTokens(tokens);
  return tokens;
}

/**
 * Logout - clear tokens and redirect to Okta logout.
 */
export function logout(): void {
  const idToken = getIdToken();
  clearTokens();

  if (idToken) {
    const params = new URLSearchParams({
      id_token_hint: idToken,
      post_logout_redirect_uri: OKTA_LOGOUT_REDIRECT_URI,
    });
    window.location.href = `https://${OKTA_DOMAIN}/oauth2/v1/logout?${params.toString()}`;
  } else {
    window.location.href = OKTA_LOGOUT_REDIRECT_URI;
  }
}

/**
 * Decode JWT payload (without verification - for display purposes only).
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Get user info from ID token.
 */
export function getUserFromToken(): { email?: string; name?: string; sub?: string } | null {
  const idToken = getIdToken();
  if (!idToken) return null;

  const payload = decodeJwtPayload(idToken);
  if (!payload) return null;

  return {
    email: payload.email as string | undefined,
    name: payload.name as string | undefined,
    sub: payload.sub as string | undefined,
  };
}
