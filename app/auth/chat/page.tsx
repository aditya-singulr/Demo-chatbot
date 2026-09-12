"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasSession, logout, getSessionCookie } from "@/lib/okta";

type Provider = { id: string; label: string; supports_files?: boolean; file_accept?: string };

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

type User = {
  login: string;
  user_id: string;
};

const FALLBACK_PROVIDERS: Provider[] = [
  { id: "bedrock_converse", label: "Bedrock · Converse (boto3)", supports_files: true, file_accept: ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.html,.doc,.docx,.xls,.xlsx" },
  { id: "bedrock_invoke_model", label: "Bedrock · InvokeModel (boto3)", supports_files: true, file_accept: ".png,.jpg,.jpeg,.gif,.webp,.pdf" },
  { id: "anthropic_sdk", label: "Anthropic SDK" },
  { id: "openai_sdk", label: "OpenAI SDK" },
];

const MAX_FILE_BYTES = 4.5 * 1024 * 1024;

const CONVERSE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "pdf", "txt", "md", "csv", "html", "doc", "docx", "xls", "xlsx"]);
const INVOKE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "pdf"]);

function allowedExtsForProvider(p?: Provider): Set<string> | null {
  if (!p?.supports_files) return null;
  if (p.id.includes("invoke_model")) return INVOKE_EXTS;
  if (p.id.includes("converse")) return CONVERSE_EXTS;
  return null;
}

function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function readFileAsAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      const data = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({ name: file.name, media_type: file.type || "application/octet-stream", data });
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
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((p) => p.id === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
      >
        <span className="max-w-[10rem] truncate">{selected?.label ?? value}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-gray-400 shrink-0">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <ul className="absolute right-0 z-10 mt-1 max-h-64 w-56 overflow-auto rounded-md border border-gray-200 bg-white py-1 text-xs shadow-lg">
          {options.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => { onChange(p.id); setOpen(false); }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-gray-50 ${p.id === value ? "text-emerald-700 font-medium" : "text-gray-700"}`}
              >
                <span className="truncate">{p.label}</span>
                {p.id === value && (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AuthenticatedChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingFile, setPendingFile] = useState<Attachment | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>(FALLBACK_PROVIDERS);
  const [provider, setProvider] = useState<string>(FALLBACK_PROVIDERS[0].id);
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeProviderMeta = providers.find((p) => p.id === provider);
  const supportsFiles = !!activeProviderMeta?.supports_files;
  const fileAccept = activeProviderMeta?.file_accept ?? "";
  const canSend = (!!input.trim() || !!pendingFile) && !loading;

  useEffect(() => {
    if (!hasSession()) {
      router.replace("/auth");
      return;
    }

    fetch("/api/auth/ui", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "test" }] }),
      credentials: "include",
    })
      .then((res) => {
        if (res.status === 401) {
          logout();
          router.replace("/auth");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
        }
        setCheckingAuth(false);
      })
      .catch(() => {
        setCheckingAuth(false);
      });

    fetch("/api/providers")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.providers) && data.providers.length) {
          setProviders(data.providers);
          setProvider((prev) =>
            data.providers.some((p: Provider) => p.id === prev) ? prev : data.providers[0].id
          );
        }
      })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!supportsFiles) {
      setPendingFile(null);
      setFileError(null);
    }
  }, [supportsFiles, provider]);

  function handleLogout() {
    logout();
    router.push("/auth");
  }

  function changeProvider(id: string) {
    if (id === provider) return;
    setProvider(id);
    setMessages([]);
    setInput("");
    setPendingFile(null);
    setFileError(null);
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileError(null);
    if (file.size > MAX_FILE_BYTES) {
      setPendingFile(null);
      setFileError(`File too large. Maximum size is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`);
      return;
    }
    const allowed = allowedExtsForProvider(activeProviderMeta);
    const ext = fileExt(file.name);
    if (allowed && !allowed.has(ext)) {
      setPendingFile(null);
      setFileError(`File type .${ext} not supported by this provider.`);
      return;
    }
    try {
      setPendingFile(await readFileAsAttachment(file));
    } catch {
      setPendingFile(null);
      setFileError("Could not read file.");
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if ((!text && !pendingFile) || loading) return;

    const attachments = pendingFile ? [pendingFile] : undefined;
    const userMessage: Message = { role: "user", content: text, ...(attachments ? { attachments } : {}) };
    const newMessages: Message[] = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setPendingFile(null);
    setFileError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: newMessages
            .filter((m) => (m.content != null && m.content !== "") || (m.attachments && m.attachments.length > 0))
            .map(({ role, content, attachments: atts }) => ({
              role,
              content,
              ...(atts?.length ? { attachments: atts } : {}),
            })),
          provider,
        }),
      });

      if (res.status === 401) {
        logout();
        router.replace("/auth");
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.upstream_body ?? data.error ?? "Request failed");
      }

      if (data.user) {
        setUser(data.user);
      }

      setMessages([...newMessages, { role: "assistant", content: data.message ?? "" }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sorry, something went wrong.";
      setMessages([...newMessages, { role: "assistant", content: message }]);
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Verifying authentication...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm">
              N
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">NovaPay Support — Aria</p>
              <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                Authenticated Session
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-xs text-gray-500 hidden sm:inline">{user.login}</span>
            )}
            <ProviderSelect
              value={provider}
              options={providers}
              onChange={changeProvider}
              disabled={loading}
            />
            <button
              onClick={handleLogout}
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
              <p className="font-medium text-gray-600">Welcome{user ? `, ${user.login.split("@")[0]}` : ""}!</p>
              <p className="text-sm">You are securely authenticated. How can Aria help you today?</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={"flex flex-col " + (msg.role === "user" ? "items-end" : "items-start")}>
            <div className={"flex w-full " + (msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 shrink-0">
                  A
                </div>
              )}
              <div className={
                "max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap " +
                (msg.role === "user"
                  ? "bg-emerald-600 text-white rounded-br-sm"
                  : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm")
              }>
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {msg.attachments.map((att) => (
                      <span
                        key={att.name}
                        className={"inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs " +
                          (msg.role === "user" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-700")}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 shrink-0">
                          <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5z" clipRule="evenodd" />
                        </svg>
                        <span className="truncate max-w-[10rem]">{att.name}</span>
                      </span>
                    ))}
                  </div>
                )}
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 shrink-0">
              A
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <span className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]"></span>
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <form onSubmit={sendMessage} className="bg-white border-t border-gray-200 px-4 py-3">
        {fileError && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <span className="mt-0.5 shrink-0">⚠</span>
            <p className="flex-1 leading-relaxed">{fileError}</p>
            <button type="button" onClick={() => setFileError(null)} className="shrink-0 rounded p-0.5 text-red-400 hover:bg-red-100 hover:text-red-700">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        )}
        {pendingFile && (
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-gray-500">
                <path fillRule="evenodd" d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.591 1.59l3.55-3.549a3 3 0 000-4.242z" clipRule="evenodd" />
              </svg>
              <span className="truncate max-w-[14rem]">{pendingFile.name}</span>
              <button type="button" onClick={() => setPendingFile(null)} className="ml-0.5 rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          {supportsFiles && (
            <>
              <input ref={fileInputRef} type="file" accept={fileAccept} className="hidden" onChange={onFileSelected} disabled={loading} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="w-9 h-9 rounded-full flex items-center justify-center border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-lg font-medium disabled:opacity-40 transition-colors"
              >
                +
              </button>
            </>
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Aria..."
            className="flex-1 rounded-full border border-emerald-200 px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!canSend}
            className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center text-white disabled:opacity-40 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
