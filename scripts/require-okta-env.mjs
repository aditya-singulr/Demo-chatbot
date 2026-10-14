/**
 * Fail fast unless Okta SSO config is present, and copy it onto NEXT_PUBLIC_*
 * so the browser login in lib/okta.ts can read it.
 */
export function requireOktaEnv() {
  if (process.env.OKTA_DOMAIN && !process.env.NEXT_PUBLIC_OKTA_DOMAIN) {
    process.env.NEXT_PUBLIC_OKTA_DOMAIN = process.env.OKTA_DOMAIN;
  }
  if (process.env.OKTA_CLIENT_ID && !process.env.NEXT_PUBLIC_OKTA_CLIENT_ID) {
    process.env.NEXT_PUBLIC_OKTA_CLIENT_ID = process.env.OKTA_CLIENT_ID;
  }

  const missing = [];
  if (!process.env.NEXT_PUBLIC_OKTA_DOMAIN?.trim()) {
    missing.push("OKTA_DOMAIN or NEXT_PUBLIC_OKTA_DOMAIN");
  }
  if (!process.env.NEXT_PUBLIC_OKTA_CLIENT_ID?.trim()) {
    missing.push("OKTA_CLIENT_ID or NEXT_PUBLIC_OKTA_CLIENT_ID");
  }

  if (missing.length) {
    console.error("Cannot start UI: Okta environment variables are not set:");
    for (const name of missing) {
      console.error(`  - ${name}`);
    }
    process.exit(1);
  }

  return {
    domain: process.env.NEXT_PUBLIC_OKTA_DOMAIN.trim(),
    clientId: process.env.NEXT_PUBLIC_OKTA_CLIENT_ID.trim(),
  };
}
