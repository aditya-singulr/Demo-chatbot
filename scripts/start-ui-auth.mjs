#!/usr/bin/env node
/**
 * Start the Next.js UI with Okta authentication enabled.
 *
 * Usage:
 *   node scripts/start-ui-auth.mjs --env-file python-chatbot/.env [--prod]
 *
 * This script loads environment variables from the specified file and starts
 * Next.js on the UI_PORT_AUTH port (default: 3001).
 *
 * Required environment variables for Okta:
 *   - OKTA_DOMAIN or NEXT_PUBLIC_OKTA_DOMAIN
 *   - OKTA_CLIENT_ID or NEXT_PUBLIC_OKTA_CLIENT_ID
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { requireOktaEnv } from "./require-okta-env.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chatbotDir = join(root, "python-chatbot");

function resolveEnvPath(envFile) {
  if (isAbsolute(envFile)) return envFile;

  const fromRoot = join(root, envFile);
  if (existsSync(fromRoot)) return fromRoot;

  const fromChatbot = join(chatbotDir, envFile);
  if (existsSync(fromChatbot)) return fromChatbot;

  return fromRoot;
}

function loadEnvFile(envFile) {
  const path = resolveEnvPath(envFile);
  if (!existsSync(path)) {
    console.error(`Env file not found: ${path}`);
    process.exit(1);
  }

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }

  return path;
}

const { values } = parseArgs({
  options: {
    "env-file": { type: "string" },
    prod: { type: "boolean", default: false },
  },
  strict: true,
});

if (!values["env-file"]) {
  console.error("Usage: node scripts/start-ui-auth.mjs --env-file <path> [--prod]");
  process.exit(1);
}

const envPath = loadEnvFile(values["env-file"]);
const okta = requireOktaEnv();

// Use UI_PORT_AUTH for authenticated UI (default: 3001)
const uiPort = process.env.UI_PORT_AUTH ?? "3001";
const nextCmd = values.prod ? "start" : "dev";

if (process.env.OKTA_SESSION_COOKIE_NAME && !process.env.NEXT_PUBLIC_OKTA_SESSION_COOKIE_NAME) {
  process.env.NEXT_PUBLIC_OKTA_SESSION_COOKIE_NAME = process.env.OKTA_SESSION_COOKIE_NAME;
}
process.env.NEXT_PUBLIC_AUTH_MODE = "okta";

console.log(`Loading env from ${envPath}`);
console.log(`Starting Next.js (auth) on port ${uiPort} (${nextCmd})`);
console.log(`Okta domain: ${okta.domain}`);

const child = spawn("npx", ["next", nextCmd, "-p", uiPort], {
  cwd: root,
  env: { ...process.env, PORT: uiPort },
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
