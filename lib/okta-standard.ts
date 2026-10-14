/**
 * Okta OAuth/OIDC client for the standard protected chatbot UI.
 *
 * This flow intentionally has its own storage keys and fixed redirect URIs.
 */

export const STANDARD_OKTA_DOMAIN =
  process.env.NEXT_PUBLIC_STANDARD_OKTA_DOMAIN ?? "singulr.okta.com";
export const STANDARD_OKTA_CLIENT_ID =
  process.env.NEXT_PUBLIC_STANDARD_OKTA_CLIENT_ID ?? "0oa26y1wj6p5lppaj1d8";
export const STANDARD_OKTA_PRODUCTION_ORIGIN = "https://chat-demo.singulr.ai";

function getStandardOrigin(): string {
  if (typeof window === "undefined") return STANDARD_OKTA_PRODUCTION_ORIGIN;
  return window.location.origin;
}

export function getStandardRedirectUri(): string {
  return `${getStandardOrigin()}/auth/callback`;
}

export function getStandardLogoutRedirectUri(): string {
  return `${getStandardOrigin()}/auth`;
}

const TOKEN_STORAGE_KEY = "novapay_standard_okta_tokens";
const PKCE_STORAGE_KEY = "novapay_standard_okta_pkce";

type StandardOktaTokens = {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  expires_at: number;
};

type PKCEData = {
  code_verifier: string;
  state: string;
  redirect_uri: string;
};

function generateRandomString(length: number): string {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => charset[byte % charset.length]).join("");
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function retrievePKCE(): PKCEData | null {
  const raw = sessionStorage.getItem(PKCE_STORAGE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PKCE_STORAGE_KEY);
  return JSON.parse(raw) as PKCEData;
}

function storeTokens(tokens: StandardOktaTokens): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

function getTokens(): StandardOktaTokens | null {
  const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as StandardOktaTokens;
}

function getIdToken(): string | null {
  const tokens = getTokens();
  if (!tokens || tokens.expires_at <= Date.now() / 1000 + 60) return null;
  return tokens.id_token;
}

function clearTokens(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function initiateStandardLogin(): Promise<void> {
  const codeVerifier = generateRandomString(64);
  const state = generateRandomString(32);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const redirectUri = getStandardRedirectUri();
  sessionStorage.setItem(
    PKCE_STORAGE_KEY,
    JSON.stringify({ code_verifier: codeVerifier, state, redirect_uri: redirectUri }),
  );

  const params = new URLSearchParams({
    client_id: STANDARD_OKTA_CLIENT_ID,
    response_type: "code",
    scope: "openid profile email",
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  window.location.href =
    `https://${STANDARD_OKTA_DOMAIN}/oauth2/v1/authorize?${params.toString()}`;
}

export async function handleStandardCallback(
  code: string,
  state: string,
): Promise<StandardOktaTokens> {
  const pkce = retrievePKCE();
  if (!pkce) throw new Error("No standard Okta PKCE data found");
  if (pkce.state !== state) throw new Error("State mismatch");

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: STANDARD_OKTA_CLIENT_ID,
    redirect_uri: pkce.redirect_uri || getStandardRedirectUri(),
    code,
    code_verifier: pkce.code_verifier,
  });

  const response = await fetch(
    `https://${STANDARD_OKTA_DOMAIN}/oauth2/v1/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error_description || "Failed to exchange code for tokens");
  }

  const tokenResponse = await response.json();
  const tokens: StandardOktaTokens = {
    ...tokenResponse,
    expires_at: Math.floor(Date.now() / 1000) + tokenResponse.expires_in,
  };
  storeTokens(tokens);
  return tokens;
}

export async function logoutStandard(): Promise<void> {
  const idToken = getIdToken();
  await fetch("/api/standard-auth/session", { method: "DELETE" }).catch(() => {});
  clearTokens();

  const params = new URLSearchParams({
    ...(idToken ? { id_token_hint: idToken } : {}),
    post_logout_redirect_uri: getStandardLogoutRedirectUri(),
  });
  window.location.href =
    `https://${STANDARD_OKTA_DOMAIN}/oauth2/v1/logout?${params.toString()}`;
}
