import { NextResponse } from "next/server";
import { getProvidersBackendUrl } from "@/lib/backends";

// Fallback list so the dropdown still renders if the backend is unreachable.
const FALLBACK = [
  { id: "bedrock_converse", label: "Bedrock · Converse (boto3)", supports_files: true, file_accept: ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.html,.doc,.docx,.xls,.xlsx,image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/csv,text/html" },
  { id: "bedrock_invoke_model", label: "Bedrock · InvokeModel (boto3)", supports_files: true, file_accept: ".png,.jpg,.jpeg,.gif,.webp,.pdf,image/png,image/jpeg,image/gif,image/webp,application/pdf" },
  { id: "anthropic_sdk", label: "Anthropic SDK", supports_files: false },
  { id: "openai_sdk", label: "OpenAI SDK", supports_files: false },
  { id: "langchain_bedrock", label: "LangChain · Bedrock", supports_files: false },
  { id: "langchain_anthropic", label: "LangChain · Anthropic", supports_files: false },
  { id: "langchain_openai", label: "LangChain · OpenAI", supports_files: false },
  { id: "bedrock_converse_stream", label: "Bedrock · Converse Stream (boto3)", supports_files: true, file_accept: ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.html,.doc,.docx,.xls,.xlsx,image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/csv,text/html" },
  { id: "bedrock_invoke_model_stream", label: "Bedrock · InvokeModel Stream (boto3)", supports_files: true, file_accept: ".png,.jpg,.jpeg,.gif,.webp,.pdf,image/png,image/jpeg,image/gif,image/webp,application/pdf" },
  { id: "bedrock_invoke_agent", label: "Bedrock Agent · InvokeAgent", supports_files: false },
  { id: "bedrock_invoke_inline_agent", label: "Bedrock Agent · InvokeInlineAgent", supports_files: false },
  { id: "bedrock_invoke_flow", label: "Bedrock Agent · InvokeFlow", supports_files: false },
  { id: "bedrock_retrieve_and_generate", label: "Bedrock Agent · Retrieve & Generate (KB RAG)", supports_files: false },
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
