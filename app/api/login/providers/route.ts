import { NextRequest } from "next/server";
import { proxyAuthenticatedJson } from "@/lib/auth-proxy";

const FALLBACK = [
  { id: "bedrock_converse", label: "Bedrock · Converse (boto3)", supports_files: true },
  { id: "anthropic_sdk", label: "Anthropic SDK", supports_files: false },
  { id: "openai_sdk", label: "OpenAI SDK", supports_files: false },
];

export async function GET(request: NextRequest) {
  const response = await proxyAuthenticatedJson(request, "/api/login/providers");
  if (response.ok) return response;
  return Response.json({ providers: FALLBACK, default: "bedrock_converse" });
}
