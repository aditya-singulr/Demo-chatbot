#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

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
  console.error("Usage: node scripts/start-ui.mjs --env-file <path> [--prod]");
  process.exit(1);
}

const envPath = loadEnvFile(values["env-file"]);
const uiPort = process.env.UI_PORT ?? "3000";
const nextCmd = values.prod ? "start" : "dev";

const oktaDomain =
  process.env.NEXT_PUBLIC_STANDARD_OKTA_DOMAIN || process.env.OKTA_DOMAIN;
const oktaClientId =
  process.env.NEXT_PUBLIC_STANDARD_OKTA_CLIENT_ID || process.env.OKTA_CLIENT_ID;
if (!oktaDomain) {
  console.warn("\nWarning: OKTA_DOMAIN is not set. Okta authentication will not work.\n");
}

if (process.env.OKTA_DOMAIN && !process.env.NEXT_PUBLIC_STANDARD_OKTA_DOMAIN) {
  process.env.NEXT_PUBLIC_STANDARD_OKTA_DOMAIN = process.env.OKTA_DOMAIN;
}
if (
  process.env.OKTA_CLIENT_ID &&
  !process.env.NEXT_PUBLIC_STANDARD_OKTA_CLIENT_ID
) {
  process.env.NEXT_PUBLIC_STANDARD_OKTA_CLIENT_ID = process.env.OKTA_CLIENT_ID;
}
process.env.NEXT_PUBLIC_AUTH_MODE = "okta-standard";

console.log(`Loading env from ${envPath}`);
console.log(`Starting Next.js (Okta protected) on port ${uiPort} (${nextCmd})`);
if (oktaDomain) {
  console.log(`Okta domain: ${oktaDomain}`);
}
if (oktaClientId) {
  console.log(`Okta client ID: ${oktaClientId}`);
}

const child = spawn("npx", ["next", nextCmd, "-p", uiPort], {
  cwd: root,
  env: { ...process.env, PORT: uiPort },
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
