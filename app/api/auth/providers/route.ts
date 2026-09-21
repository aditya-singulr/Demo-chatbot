import { NextResponse } from "next/server";
import { getBackendUrls } from "@/lib/backends";

const FALLBACK = [
  { id: "bedrock_converse", label: "Bedrock · Converse (boto3)", supports_files: true },
  { id: "anthropic_sdk", label: "Anthropic SDK", supports_files: false },
  { id: "openai_sdk", label: "OpenAI SDK", supports_files: false },
];

export async function GET() {
  const { withAuth } = getBackendUrls();

  try {
    const res = await fetch(`${withAuth}/api/providers`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`backend ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({
      providers: FALLBACK,
      default: "bedrock_converse",
    });
  }
}
