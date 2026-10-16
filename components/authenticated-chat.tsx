"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { checkAuthStatus, logout } from "@/lib/okta";
import {
  getLoginToken,
  logoutLogin,
  useLoginToken,
  useLoginUser,
} from "@/lib/login-auth";
import { logoutOtpLogin } from "@/lib/otp-login-auth";

export type AuthenticatedChatMode = "okta" | "login" | "otp-login";

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

function displayMode(mode: AuthenticatedChatMode): string {
  if (mode === "okta") return "Okta";
  if (mode === "login") return "username/password";
  return "password + OTP cookie";
}

function apiPrefix(mode: AuthenticatedChatMode): string {
  return mode === "okta" ? "/api/auth" : mode === "login" ? "/api/login" : "/api/otp-login";
}

export default function AuthenticatedChat({ mode }: { mode: AuthenticatedChatMode }) {
  const router = useRouter();
  const loginToken = useLoginToken();
  const loginUser = useLoginUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingFile, setPendingFile] = useState<Attachment | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [providers, setProviders] = useState<Provider[]>(FALLBACK_PROVIDERS);
  const [provider, setProvider] = useState(FALLBACK_PROVIDERS[0].id);
  const [identity, setIdentity] = useState("");
  const [showCookiePopup, setShowCookiePopup] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeProvider = providers.find((item) => item.id === provider);
  const supportsFiles = !!activeProvider?.supports_files;
  const fileAccept = activeProvider?.file_accept ?? "";
  const canSend = (!!input.trim() || !!pendingFile) && !loading;

  useEffect(() => {
    let active = true;

    async function initialize() {
      if (mode === "okta") {
        try {
          const status = await checkAuthStatus();
          if (!active) return;
          if (!status.authenticated) {
            router.replace("/auth");
            return;
          }
          setIdentity(status.login || status.email || "");
          setCheckingAuth(false);
        } catch {
          router.replace("/auth");
          return;
        }
      } else if (mode === "login") {
        if (!loginToken) {
          router.replace("/login");
          return;
        }
        if (active) {
          setIdentity(loginUser?.username ?? "");
          setCheckingAuth(false);
        }
      } else {
        try {
          const response = await fetch(`${apiPrefix(mode)}/check`, {
            credentials: "include",
          });
          const data = await response.json();
          if (!active) return;
          if (!data.authenticated) {
            router.replace("/otp-login");
            return;
          }
          setIdentity(data.username ?? "");
          setCheckingAuth(false);
          if (window.location.search.includes("welcome=1")) {
            setShowCookiePopup(true);
            window.history.replaceState({}, "", "/otp-login/chat");
          }
        } catch {
          router.replace("/otp-login");
          return;
        }
      }

      const response = await fetch(`${apiPrefix(mode)}/providers`, {
        credentials: mode === "otp-login" || mode === "okta" ? "include" : "same-origin",
      }).catch(() => null);
      if (!active || !response?.ok) return;
      const data = await response.json().catch(() => ({}));
      if (Array.isArray(data.providers) && data.providers.length) {
        setProviders(data.providers);
        setProvider((current) =>
          data.providers.some((item: Provider) => item.id === current)
            ? current
            : data.providers[0].id,
        );
      }
    }

    void initialize();
    return () => {
      active = false;
    };
  }, [loginToken, loginUser, mode, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!supportsFiles) {
      setPendingFile(null);
      setFileError(null);
    }
  }, [provider, supportsFiles]);

  function handleLogout() {
    if (mode === "okta") {
      logout();
    } else if (mode === "login") {
      logoutLogin();
    } else {
      void logoutOtpLogin();
    }
  }

  function changeProvider(nextProvider: string) {
    if (nextProvider === provider) return;
    setProvider(nextProvider);
    setMessages([]);
    setInput("");
    setPendingFile(null);
    setFileError(null);
  }

  async function onFileSelected(event: ChangeEvent<HTMLInputElement>) {
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
    const extension = fileExtension(file.name);
    if (accepted?.length && !accepted.includes(extension)) {
      setPendingFile(null);
      setFileError(`File type .${extension} is not supported by this provider.`);
      return;
    }

    try {
      setPendingFile(await readFileAsAttachment(file));
    } catch {
      setPendingFile(null);
      setFileError("Could not read file.");
    }
  }

  function requestInit(): RequestInit | null {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (mode === "login") {
      const token = getLoginToken();
      if (!token) return null;
      headers.set("Authorization", `Bearer ${token}`);
    }
    return {
      headers,
      credentials: mode === "otp-login" || mode === "okta" ? "include" : "same-origin",
    };
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if ((!text && !pendingFile) || loading) return;

    const request = requestInit();
    if (!request) {
      handleLogout();
      return;
    }

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
      const response = await fetch(`${apiPrefix(mode)}/ui`, {
        ...request,
        method: "POST",
        body: JSON.stringify({ messages: newMessages, provider }),
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.upstream_body ?? data.detail ?? data.error ?? "Request failed");
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
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500">
        Verifying authentication...
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
              N
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">NovaPay Support — Aria</p>
              <p className="text-xs font-medium text-emerald-600">
                Authenticated via {displayMode(mode)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {identity && <span className="hidden text-xs text-gray-500 sm:inline">{identity}</span>}
            <select
              value={provider}
              onChange={(event) => changeProvider(event.target.value)}
              disabled={loading}
              className="max-w-52 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
            >
              {providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleLogout}
              className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-gray-400">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
              🔐
            </div>
            <div>
              <p className="font-medium text-gray-600">
                Welcome{identity ? `, ${identity.split("@")[0]}` : ""}!
              </p>
              <p className="text-sm">You are securely authenticated. How can Aria help you today?</p>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {message.role === "assistant" && (
              <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                A
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                message.role === "user"
                  ? "rounded-br-sm bg-emerald-600 text-white"
                  : "rounded-bl-sm border border-gray-200 bg-white text-gray-800 shadow-sm"
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
            <div className="mr-2 mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
              A
            </div>
            <div className="rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-3 text-gray-400 shadow-sm">
              ...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <form onSubmit={sendMessage} className="border-t border-gray-200 bg-white px-4 py-3">
        {fileError && <div className="mb-2 text-xs text-red-700">{fileError}</div>}
        {pendingFile && (
          <div className="mb-2 text-xs text-gray-700">
            Attached: {pendingFile.name}{" "}
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              className="text-gray-400 hover:text-gray-700"
            >
              remove
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          {supportsFiles && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={fileAccept}
                className="hidden"
                onChange={onFileSelected}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 text-lg text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-40"
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
            className="flex-1 rounded-full border border-emerald-200 px-4 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!canSend}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
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
              This demo uses cookies to keep your chat session active. Choose whether to accept all
              cookies to continue.
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
