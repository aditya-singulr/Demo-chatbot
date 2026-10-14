import { redirect } from "next/navigation";

/**
 * `/` never serves chat. Send the user to the login for this UI mode.
 */
export default function RootPage() {
  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE;
  if (authMode === "login") redirect("/login");
  if (authMode === "otp-login") redirect("/otp-login");
  redirect("/auth");
}
