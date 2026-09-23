const TOKEN_KEY = "login_token";
const USER_KEY = "login_user";

export type LoginUser = {
  username: string;
};

export function storeLoginSession(token: string, user: LoginUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getLoginToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getLoginUser(): LoginUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LoginUser;
  } catch {
    return null;
  }
}

export function hasLoginToken(): boolean {
  return !!getLoginToken();
}

export function logoutLogin(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
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
