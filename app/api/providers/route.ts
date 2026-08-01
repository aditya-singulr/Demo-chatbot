import { NextResponse } from "next/server";
import { getProvidersBackendUrl } from "@/lib/backends";

// Fallback list so the dropdown still renders if the backend is unreachable.
const FALLBACK = [
  { id: "bedrock_converse", label: "Bedrock · Converse (boto3)" },
  { id: "bedrock_invoke_model", label: "Bedrock · InvokeModel (boto3)" },
  { id: "anthropic_sdk", label: "Anthropic SDK" },
  { id: "openai_sdk", label: "OpenAI SDK" },
  { id: "langchain_bedrock", label: "LangChain · Bedrock" },
  { id: "langchain_anthropic", label: "LangChain · Anthropic" },
  { id: "langchain_openai", label: "LangChain · OpenAI" },
  { id: "bedrock_converse_stream", label: "Bedrock · Converse Stream (boto3)" },
  { id: "bedrock_invoke_model_stream", label: "Bedrock · InvokeModel Stream (boto3)" },
  { id: "bedrock_invoke_agent", label: "Bedrock Agent · InvokeAgent" },
  { id: "bedrock_invoke_inline_agent", label: "Bedrock Agent · InvokeInlineAgent" },
  { id: "bedrock_invoke_flow", label: "Bedrock Agent · InvokeFlow" },
  { id: "bedrock_retrieve_and_generate", label: "Bedrock Agent · Retrieve & Generate (KB RAG)" },
];

export async function GET() {
  const backend = getProvidersBackendUrl();

  try {
    const res = await fetch(`${backend}/api/providers`, {
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
