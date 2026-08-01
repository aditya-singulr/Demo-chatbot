function backendUrlFromPort(envVar: string, defaultPort: string): string {
  const host = process.env.BACKEND_HOST ?? "127.0.0.1";
  const port = process.env[envVar] ?? defaultPort;
  return `http://${host}:${port}`;
}

export function getBackendUrls() {
  return {
    withoutGuardrail:
      process.env.BACKEND_WITHOUT_GUARDRAIL ??
      backendUrlFromPort("BACKEND_PORT_NO_GUARDRAIL", "8000"),
    withGuardrail:
      process.env.BACKEND_WITH_GUARDRAIL ??
      backendUrlFromPort("BACKEND_PORT_GUARDRAIL", "8001"),
    withGuardrailLitellm:
      process.env.BACKEND_WITH_GUARDRAIL_LITELLM ??
      backendUrlFromPort("BACKEND_PORT_GUARDRAIL_LITELLM", "8002"),
  };
}

export function getProvidersBackendUrl(): string {
  return getBackendUrls().withoutGuardrail;
}
