"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { logoutOtpLogin } from "@/lib/otp-login-auth";

type Provider = {
  id: string;
  label: string;
  supports_files?: boolean;
  file_accept?: string;
};

type Attachment = {
  name: string;
  media_type: string;
  data: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
};

const FALLBACK_PROVIDERS: Provider[] = [
  {
    id: "bedrock_converse",
    label: "Bedrock · Converse (boto3)",
    supports_files: true,
    file_accept: ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.html,.doc,.docx,.xls,.xlsx",
  },
  {
    id: "bedrock_invoke_model",
    label: "Bedrock · InvokeModel (boto3)",
    supports_files: true,
    file_accept: ".png,.jpg,.jpeg,.gif,.webp,.pdf",
  },
  { id: "anthropic_sdk", label: "Anthropic SDK" },
  { id: "openai_sdk", label: "OpenAI SDK" },
];

const MAX_FILE_BYTES = 4.5 * 1024 * 1024;

function fileExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function readFileAsAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve({
        name: file.name,
        media_type: file.type || "application/octet-stream",
        data: comma >= 0 ? result.slice(comma + 1) : result,
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function ProviderSelect({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: Provider[];
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="max-w-52 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export default function OtpLoginChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingFile, setPendingFile] = useState<Attachment | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [username, setUsername] = useState("");
  const [providers, setProviders] = useState<Provider[]>(FALLBACK_PROVIDERS);
  const [provider, setProvider] = useState(FALLBACK_PROVIDERS[0].id);
  const [showCookiePopup, setShowCookiePopup] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeProvider = providers.find((item) => item.id === provider);
  const supportsFiles = !!activeProvider?.supports_files;
  const canSend = (!!input.trim() || !!pendingFile) && !loading;

  useEffect(() => {
    let active = true;
    fetch("/api/otp-login/check", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        if (!data.authenticated) {
          router.replace("/otp-login");
          return;
        }
        setUsername(data.username ?? "");
        setCheckingAuth(false);
        if (window.location.search.includes("welcome=1")) {
          setShowCookiePopup(true);
          window.history.replaceState({}, "", "/otp-login/chat");
        }
      })
      .catch(() => router.replace("/otp-login"));
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (checkingAuth) return;
    fetch("/api/otp-login/providers", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data.providers) && data.providers.length) {
          setProviders(data.providers);
          setProvider((current) =>
            data.providers.some((item: Provider) => item.id === current)
              ? current
              : data.providers[0].id,
          );
        }
      })
      .catch(() => {});
  }, [checkingAuth]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!supportsFiles) {
      setPendingFile(null);
      setFileError(null);
    }
  }, [provider, supportsFiles]);

  function changeProvider(nextProvider: string) {
    if (nextProvider === provider) return;
    setProvider(nextProvider);
    setMessages([]);
    setInput("");
    setPendingFile(null);
    setFileError(null);
  }

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileError(null);
    if (file.size > MAX_FILE_BYTES) {
      setPendingFile(null);
      setFileError(`File too large. Maximum size is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`);
      return;
    }
    const accepted = activeProvider?.file_accept
      ?.split(",")
      .map((item) => item.replace(".", "").toLowerCase());
    if (accepted?.length && !accepted.includes(fileExtension(file.name))) {
      setPendingFile(null);
      setFileError(`File type .${fileExtension(file.name)} is not supported by this provider.`);
      return;
    }
    try {
      setPendingFile(await readFileAsAttachment(file));
    } catch {
      setPendingFile(null);
      setFileError("Could not read file.");
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if ((!text && !pendingFile) || loading) return;

    const attachments = pendingFile ? [pendingFile] : undefined;
    const userMessage: Message = {
      role: "user",
      content: text,
      ...(attachments ? { attachments } : {}),
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setPendingFile(null);
    setFileError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/otp-login/ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: newMessages, provider }),
      });
      if (response.status === 401) {
        await logoutOtpLogin();
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? data.error ?? "Request failed");
      }
      setMessages([...newMessages, { role: "assistant", content: data.message ?? "" }]);
    } catch (error) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Sorry, something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">Checking your session...</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              N
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">NovaPay Support — Aria</p>
              <p className="text-xs text-emerald-600 font-medium">Authenticated via password + OTP cookie</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {username && <span className="text-xs text-gray-500 hidden sm:inline">{username}</span>}
            <ProviderSelect value={provider} options={providers} onChange={changeProvider} disabled={loading} />
            <button
              onClick={() => void logoutOtpLogin()}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 gap-3">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl">
              🔐
            </div>
            <div>
              <p className="font-medium text-gray-600">Welcome{username ? `, ${username}` : ""}!</p>
              <p className="text-sm">You are signed in. How can Aria help you today?</p>
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            {message.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 shrink-0">
                A
              </div>
            )}
            <div
              className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                message.role === "user"
                  ? "bg-emerald-600 text-white rounded-br-sm"
                  : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm"
              }`}
            >
              {message.attachments?.map((attachment) => (
                <div key={attachment.name} className="mb-1 text-xs opacity-80">
                  Attached: {attachment.name}
                </div>
              ))}
              {message.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1">
              A
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm text-gray-400">...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <form onSubmit={sendMessage} className="bg-white border-t border-gray-200 px-4 py-3">
        {fileError && <div className="mb-2 text-xs text-red-700">{fileError}</div>}
        {pendingFile && (
          <div className="mb-2 text-xs text-gray-700">
            Attached: {pendingFile.name}{" "}
            <button type="button" onClick={() => setPendingFile(null)} className="text-gray-400 hover:text-gray-700">
              remove
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          {supportsFiles && (
            <>
              <input ref={fileInputRef} type="file" accept={activeProvider?.file_accept} className="hidden" onChange={onFileSelected} disabled={loading} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="w-9 h-9 rounded-full flex items-center justify-center border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-lg disabled:opacity-40"
              >
                +
              </button>
            </>
          )}
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Message Aria..."
            className="flex-1 rounded-full border border-emerald-200 px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!canSend}
            className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center text-white disabled:opacity-40"
          >
            ↑
          </button>
        </div>
      </form>

      {showCookiePopup && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">We value your privacy</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              This demo uses cookies to keep your chat session active. Choose whether to accept all cookies to continue.
            </p>
            <button
              type="button"
              onClick={() => setShowCookiePopup(false)}
              className="mt-5 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Accept all cookies
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
