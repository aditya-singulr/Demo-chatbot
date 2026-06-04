"use client";

import { useState, useRef, useEffect } from "react";

type Security = {
  category: string;
  confidence: string;
  reason: string;
  total_attacks: number;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  security?: Security | null;
};

type Mode = "no_guardrail" | "guardrail";

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  prompt_injection:   { label: "Prompt Injection",   color: "bg-red-100 text-red-700 border-red-200" },
  jailbreak:          { label: "Jailbreak Attempt",  color: "bg-orange-100 text-orange-700 border-orange-200" },
  social_engineering: { label: "Social Engineering", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  competitor_probe:   { label: "Competitor Probe",   color: "bg-blue-100 text-blue-700 border-blue-200" },
  system_probe:       { label: "System Probe",       color: "bg-purple-100 text-purple-700 border-purple-200" },
  roleplay_attack:    { label: "Roleplay Attack",    color: "bg-pink-100 text-pink-700 border-pink-200" },
};

export default function Home() {
  const [mode, setMode] = useState<Mode>("no_guardrail");
  const [chats, setChats] = useState<Record<Mode, Message[]>>({ no_guardrail: [], guardrail: [] });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [totalAttacks, setTotalAttacks] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = chats[mode];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, loading, mode]);

  function switchMode(newMode: Mode) {
    setMode(newMode);
    setInput("");
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setChats(prev => ({ ...prev, [mode]: newMessages }));
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages
            .filter(m => m.content != null && m.content !== "")
            .map(({ role, content }) => ({ role, content })),
          mode: mode === "guardrail" ? "guardrail" : "no_guardrail",
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Request failed");

      if (data.security?.total_attacks !== undefined) {
        setTotalAttacks(data.security.total_attacks);
      }

      setChats(prev => ({
        ...prev,
        [mode]: [...newMessages, { role: "assistant", content: data.message ?? "", security: data.security }],
      }));
    } catch {
      setChats(prev => ({
        ...prev,
        [mode]: [...newMessages, { role: "assistant", content: "Sorry, something went wrong.", security: null }],
      }));
    } finally {
      setLoading(false);
    }
  }

  const isGuardrail = mode === "guardrail";

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm ${isGuardrail ? "bg-emerald-600" : "bg-red-600"}`}>
              N
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">NovaPay Support — Aria</p>
              <p className={`text-xs font-medium flex items-center gap-1 ${isGuardrail ? "text-emerald-600" : "text-red-600"}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${isGuardrail ? "bg-emerald-600" : "bg-red-600"}`}></span>
                {isGuardrail ? "With Guardrail · Singulr SDK" : "Without Guardrail · Unprotected"}
              </p>
            </div>
          </div>
          {totalAttacks > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-xs font-medium text-red-700">{totalAttacks} attack{totalAttacks !== 1 ? "s" : ""} detected</span>
            </div>
          )}
        </div>

        <div className="mt-3 flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          <button
            onClick={() => switchMode("no_guardrail")}
            className={`flex-1 py-1.5 transition-colors ${!isGuardrail ? "bg-red-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >
            Without Guardrail
          </button>
          <button
            onClick={() => switchMode("guardrail")}
            className={`flex-1 py-1.5 transition-colors ${isGuardrail ? "bg-emerald-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >
            With Guardrail
          </button>
        </div>

        <p className="mt-2 text-xs text-gray-400">
          {isGuardrail
            ? "Protected by Singulr SDK guardrail — attacks are detected and blocked"
            : "No guardrail configured — vulnerable to prompt injection and manipulation"}
        </p>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 gap-3">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${isGuardrail ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}>
              {isGuardrail ? "🛡️" : "⚠️"}
            </div>
            <div>
              <p className="font-medium text-gray-600">Hi, I am Aria!</p>
              <p className="text-sm">
                {isGuardrail
                  ? "Guardrail active — I'm protected against attacks"
                  : "No guardrail — I'm vulnerable to manipulation"}
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={"flex flex-col " + (msg.role === "user" ? "items-end" : "items-start")}>
            {msg.role === "user" && msg.security && msg.security.category !== "safe" && (
              <div className={`mb-1 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${CATEGORY_LABELS[msg.security.category]?.color ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                <span>⚠</span>
                <span>{CATEGORY_LABELS[msg.security.category]?.label ?? msg.security.category}</span>
                <span className="opacity-60">· {msg.security.confidence} confidence</span>
              </div>
            )}
            <div className={"flex w-full " + (msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "assistant" && (
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 shrink-0 ${isGuardrail ? "bg-emerald-600" : "bg-red-600"}`}>
                  A
                </div>
              )}
              <div className={
                "max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap " +
                (msg.role === "user"
                  ? (isGuardrail ? "bg-emerald-600 text-white rounded-br-sm" : "bg-red-600 text-white rounded-br-sm")
                  : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm")
              }>
                {msg.content}
              </div>
            </div>
            {msg.role === "user" && msg.security && msg.security.category !== "safe" && (
              <p className="text-xs text-gray-400 mt-1 max-w-[75%] text-right">{msg.security.reason}</p>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 shrink-0 ${isGuardrail ? "bg-emerald-600" : "bg-red-600"}`}>
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

      <form onSubmit={sendMessage} className="bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isGuardrail ? "Message Aria (with guardrail)..." : "Message Aria (no guardrail)..."}
          className={`flex-1 rounded-full border px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:border-transparent ${isGuardrail ? "border-emerald-200 focus:ring-emerald-500" : "border-red-200 focus:ring-red-500"}`}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className={`w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40 transition-colors ${isGuardrail ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
