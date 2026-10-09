import { useSyncExternalStore } from "react";

const TOKEN_KEY = "login_token";
const USER_KEY = "login_user";

export type LoginUser = {
  username: string;
};

let cachedUserRaw: string | null = null;
let cachedUser: LoginUser | null = null;

function subscribeToStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("login-auth-change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("login-auth-change", onStoreChange);
  };
}

function getServerSnapshot(): null {
  return null;
}

export function storeLoginSession(token: string, user: LoginUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  cachedUserRaw = null;
  cachedUser = null;
  window.dispatchEvent(new Event("login-auth-change"));
}

export function getLoginToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getLoginUser(): LoginUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (raw === cachedUserRaw) return cachedUser;
  cachedUserRaw = raw;
  if (!raw) {
    cachedUser = null;
    return null;
  }
  try {
    cachedUser = JSON.parse(raw) as LoginUser;
  } catch {
    cachedUser = null;
  }
  return cachedUser;
}

export function hasLoginToken(): boolean {
  return !!getLoginToken();
}

/** Client token that matches SSR (null) during hydration. */
export function useLoginToken(): string | null {
  return useSyncExternalStore(subscribeToStorage, getLoginToken, getServerSnapshot);
}

export function useLoginUser(): LoginUser | null {
  return useSyncExternalStore(subscribeToStorage, getLoginUser, getServerSnapshot);
}

export function logoutLogin(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  cachedUserRaw = null;
  cachedUser = null;
  window.dispatchEvent(new Event("login-auth-change"));
  window.location.href = "/login";
}

export async function loginWithPassword(username: string, password: string): Promise<void> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail ?? data.error ?? "Invalid username or password";
    throw new Error(typeof detail === "string" ? detail : "Invalid username or password");
  }
  if (!data.token) {
    throw new Error("No token returned");
  }

  storeLoginSession(data.token, data.user ?? { username });
}
