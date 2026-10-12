export type OtpLoginUser = {
  username: string;
};

type AuthResponse = {
  user?: OtpLoginUser;
  detail?: unknown;
  error?: unknown;
};

async function readAuthResponse(response: Response): Promise<AuthResponse> {
  return response.json().catch(() => ({}));
}

function errorMessage(data: AuthResponse, fallback: string): string {
  const detail = data.detail ?? data.error;
  return typeof detail === "string" ? detail : fallback;
}

export async function loginWithOtpCredentials(
  username: string,
  password: string,
): Promise<OtpLoginUser> {
  const response = await fetch("/api/otp-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    credentials: "include",
  });
  const data = await readAuthResponse(response);
  if (!response.ok) {
    throw new Error(errorMessage(data, "Invalid username or password"));
  }
  return data.user ?? { username };
}

export async function verifyOtp(
  username: string,
  otp: string,
): Promise<OtpLoginUser> {
  const response = await fetch("/api/otp-login/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, otp }),
    credentials: "include",
  });
  const data = await readAuthResponse(response);
  if (!response.ok) {
    throw new Error(errorMessage(data, "Invalid OTP"));
  }
  return data.user ?? { username };
}

export async function logoutOtpLogin(): Promise<void> {
  await fetch("/api/otp-login/logout", {
    method: "POST",
    credentials: "include",
  }).catch(() => {});
  window.location.href = "/otp-login";
}
