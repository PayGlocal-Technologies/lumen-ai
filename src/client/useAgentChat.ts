"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { DEFAULT_MODEL, type AgentEvent, type AgentModel, type SerializedDOMElement } from "../types/index.js";

export type MessageBlock = { type: "text"; text: string } | { type: "tool"; summary: string };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  blocks: MessageBlock[];
  imagePreviewUrl?: string;
}

export interface Conversation {
  id: string;
  name: string;
  messages: ChatMessage[];
  claudeSessionId?: string;
  createdAt: string;
  lastActive: string;
}

const LS_CONVERSATIONS = "lumen:conversations";
const LS_ACTIVE_ID = "lumen:activeConversationId";
const SS_RELOAD_CONVO = "lumen:reloadConvoId";

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function newConversation(name = "New Chat"): Conversation {
  const now = new Date().toISOString();
  return { id: newId(), name, messages: [], createdAt: now, lastActive: now };
}

function persistConversations(convos: Conversation[]): void {
  try {
    const toSave = convos.map((c) => ({
      ...c,
      messages: c.messages.slice(-50).map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.blocks?.length ? { blocks: m.blocks } : {}),
      })),
    }));
    localStorage.setItem(LS_CONVERSATIONS, JSON.stringify(toSave));
  } catch { /* ignore */ }
}

function migrateMessage(raw: Record<string, unknown>): ChatMessage {
  if (Array.isArray(raw.blocks)) return raw as unknown as ChatMessage;
  const tools = Array.isArray(raw.tools) ? (raw.tools as string[]) : [];
  const content = typeof raw.content === "string" ? raw.content : "";
  const blocks: MessageBlock[] = [
    ...tools.map((t) => ({ type: "tool" as const, summary: t })),
    ...(content ? [{ type: "text" as const, text: content }] : []),
  ];
  return { role: raw.role as "user" | "assistant", content, blocks };
}

async function readSSEStream(res: Response, onEvent: (ev: AgentEvent) => void): Promise<void> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      onEvent(JSON.parse(line.slice(6)) as AgentEvent);
    }
  }
}

type HookState = { conversations: Conversation[]; activeId: string };

function initHookState(): HookState {
  if (typeof window === "undefined") {
    const c = newConversation();
    return { conversations: [c], activeId: c.id };
  }

  let conversations: Conversation[] = [];
  try {
    const raw = localStorage.getItem(LS_CONVERSATIONS);
    if (raw) {
      const parsed = JSON.parse(raw) as Conversation[];
      conversations = parsed.map((c) => ({
        ...c,
        messages: c.messages.map((m) => migrateMessage(m as unknown as Record<string, unknown>)),
      }));
    }
  } catch { /* ignore */ }

  // Migrate from old design-agent:* keys
  if (!conversations.length) {
    try {
      const oldMsgs = localStorage.getItem("design-agent:messages") ?? localStorage.getItem("lumen:messages");
      const oldSid = localStorage.getItem("design-agent:sessionId") ?? localStorage.getItem("lumen:sessionId");
      if (oldMsgs) {
        const c = newConversation("Imported Chat");
        c.messages = (JSON.parse(oldMsgs) as Record<string, unknown>[]).map(migrateMessage);
        if (oldSid) c.claudeSessionId = oldSid;
        localStorage.removeItem("design-agent:messages");
        localStorage.removeItem("design-agent:sessionId");
        conversations = [c];
      }
    } catch { /* ignore */ }
  }

  if (!conversations.length) conversations = [newConversation()];

  conversations = conversations.map((c) => {
    const last = c.messages[c.messages.length - 1];
    if (last?.role === "assistant" && !last.content && !last.blocks?.length) {
      return { ...c, messages: c.messages.slice(0, -1) };
    }
    return c;
  });

  let activeId = conversations[0].id;
  try {
    const saved = localStorage.getItem(LS_ACTIVE_ID);
    if (saved && conversations.some((c) => c.id === saved)) activeId = saved;
  } catch { /* ignore */ }

  return { conversations, activeId };
}

export function useAgentChat(apiBasePath = "/api/lumen") {
  const [state, setState] = useState<HookState>(initHookState);
  const [model, setModel] = useState<AgentModel>(DEFAULT_MODEL);
  const [streaming, setStreaming] = useState(false);
  const [creditsExhausted, setCreditsExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [costUsd, setCostUsd] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);

  useEffect(() => { stateRef.current = state; }, [state]);

  const conversations = state.conversations;
  const activeId = state.activeId;
  const activeConversation = conversations.find((c) => c.id === activeId) ?? conversations[0];
  const messages = activeConversation?.messages ?? [];

  const setConvos = useCallback((fn: (prev: Conversation[]) => Conversation[]) => {
    setState((s) => {
      const next = fn(s.conversations);
      persistConversations(next);
      return { ...s, conversations: next };
    });
  }, []);

  const setActiveId = useCallback((id: string) => {
    setState((s) => ({ ...s, activeId: id }));
    try { localStorage.setItem(LS_ACTIVE_ID, id); } catch { /* ignore */ }
  }, []);

  const appendDelta = useCallback((convId: string, delta: string) => {
    setState((s) => {
      const next = s.conversations.map((c) => {
        if (c.id !== convId) return c;
        const lastIdx = c.messages.length - 1;
        const last = c.messages[lastIdx];
        if (!last || last.role !== "assistant") return c;
        const blocks = last.blocks;
        const lastBlock = blocks[blocks.length - 1];
        const newBlocks: MessageBlock[] =
          lastBlock?.type === "text"
            ? [...blocks.slice(0, -1), { type: "text", text: lastBlock.text + delta }]
            : [...blocks, { type: "text", text: delta }];
        return { ...c, messages: [...c.messages.slice(0, lastIdx), { ...last, content: last.content + delta, blocks: newBlocks }] };
      });
      persistConversations(next);
      return { ...s, conversations: next };
    });
  }, []);

  const appendTool = useCallback((convId: string, tool: string) => {
    setState((s) => {
      const next = s.conversations.map((c) => {
        if (c.id !== convId) return c;
        const lastIdx = c.messages.length - 1;
        const last = c.messages[lastIdx];
        if (!last || last.role !== "assistant") return c;
        const blocks = last.blocks;
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock?.type === "tool" && lastBlock.summary === tool) return c;
        return { ...c, messages: [...c.messages.slice(0, lastIdx), { ...last, blocks: [...blocks, { type: "tool" as const, summary: tool }] }] };
      });
      persistConversations(next);
      return { ...s, conversations: next };
    });
  }, []);

  const setClaudeSession = useCallback((convId: string, sessionId: string) => {
    setState((s) => ({
      ...s,
      conversations: s.conversations.map((c) => c.id === convId ? { ...c, claudeSessionId: sessionId } : c),
    }));
  }, []);

  const send = useCallback(
    async (prompt: string, image?: File | null, selectedElement?: SerializedDOMElement | null) => {
      const text = prompt.trim();
      const { conversations: convos, activeId: aid } = stateRef.current;
      const convo = convos.find((c) => c.id === aid) ?? convos[0];
      if ((!text && !image) || streaming || !convo) return;

      setError(null);
      setCreditsExhausted(false);

      const convId = convo.id;
      const now = new Date().toISOString();
      let imagePreviewUrl: string | undefined;
      if (image) imagePreviewUrl = URL.createObjectURL(image);

      // Auto-title from current URL path (no next/navigation dep)
      if (convo.name === "New Chat" && convo.messages.length === 0) {
        const routeSegment = (typeof window !== "undefined" ? window.location.pathname : "").split("/").filter(Boolean)[0];
        const prefix = routeSegment
          ? `${routeSegment.charAt(0).toUpperCase()}${routeSegment.slice(1)} — `
          : "";
        const body = (text || "Image").replace(/\s+/g, " ").trim();
        const maxBody = 42 - prefix.length;
        const title = prefix + (body.length > maxBody ? body.slice(0, maxBody) + "…" : body);
        setConvos((prev) => prev.map((c) => (c.id === convId ? { ...c, name: title } : c)));
      }

      setState((s) => {
        const next = s.conversations.map((c) => {
          if (c.id !== convId) return c;
          return {
            ...c,
            lastActive: now,
            messages: [
              ...c.messages,
              { role: "user" as const, content: text, blocks: [], imagePreviewUrl },
              { role: "assistant" as const, content: "", blocks: [] },
            ],
          };
        });
        persistConversations(next);
        return { ...s, conversations: next };
      });

      setStreaming(true);
      try { sessionStorage.setItem(SS_RELOAD_CONVO, convId); } catch { /* ignore */ }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        let imagePath: string | undefined;
        if (image) {
          const fd = new FormData();
          fd.append("file", image);
          const up = await fetch(`${apiBasePath}/upload`, { method: "POST", body: fd, signal: controller.signal });
          if (!up.ok) throw new Error("Image upload failed.");
          const data = (await up.json()) as { tmpPath: string };
          imagePath = data.tmpPath;
        }

        const currentRoute = typeof window !== "undefined" ? window.location.pathname : undefined;
        const res = await fetch(apiBasePath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, model, sessionId: convo.claudeSessionId, imagePath, conversationId: convId, currentRoute, selectedElement: selectedElement ?? undefined }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

        await readSSEStream(res, (ev) => {
          switch (ev.type) {
            case "session": setClaudeSession(convId, ev.sessionId); break;
            case "text": flushSync(() => appendDelta(convId, ev.delta)); break;
            case "tool": appendTool(convId, ev.summary); break;
            case "usage": setCostUsd(ev.costUsd); break;
            case "done": setCostUsd(ev.costUsd); if (ev.sessionId) setClaudeSession(convId, ev.sessionId); break;
            case "credits_exhausted": setCreditsExhausted(true); if (ev.sessionId) setClaudeSession(convId, ev.sessionId); break;
            case "error": setError(ev.message); break;
          }
        });
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setStreaming(false);
        try { sessionStorage.removeItem(SS_RELOAD_CONVO); } catch { /* ignore */ }
        abortRef.current = null;
        setState((s) => {
          const c = s.conversations.find((c) => c.id === convId);
          if (!c) return s;
          const last = c.messages[c.messages.length - 1];
          if (last?.role !== "assistant" || last.content || last.blocks.length) return s;
          const next = s.conversations.map((conv) =>
            conv.id === convId ? { ...conv, messages: conv.messages.slice(0, -1) } : conv
          );
          persistConversations(next);
          return { ...s, conversations: next };
        });
      }
    },
    [streaming, model, appendDelta, appendTool, setClaudeSession, setConvos, apiBasePath]
  );

  const reconnect = useCallback(
    async (convId: string) => {
      if (streaming) return;
      const { conversations: convos } = stateRef.current;
      const convo = convos.find((c) => c.id === convId);
      if (!convo) return;
      const lastMsg = convo.messages[convo.messages.length - 1];
      if (!lastMsg || lastMsg.role !== "assistant") return;

      setStreaming(true);
      setError(null);

      setState((s) => ({
        ...s,
        conversations: s.conversations.map((c) => {
          if (c.id !== convId) return c;
          const msgs = c.messages;
          if (msgs[msgs.length - 1]?.role !== "assistant") return c;
          return { ...c, messages: [...msgs.slice(0, -1), { role: "assistant" as const, content: "", blocks: [] }] };
        }),
      }));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`${apiBasePath}?conversationId=${encodeURIComponent(convId)}`, { signal: controller.signal });
        if (res.status === 404) {
          setState((s) => ({ ...s, conversations: s.conversations.map((c) => c.id === convId ? { ...c, messages: convo.messages } : c) }));
          setStreaming(false);
          return;
        }
        if (!res.ok || !res.body) throw new Error(`Reconnect failed (${res.status})`);

        await readSSEStream(res, (ev) => {
          switch (ev.type) {
            case "resume":
              if (ev.claudeSessionId) setClaudeSession(convId, ev.claudeSessionId);
              setState((s) => {
                const next = s.conversations.map((c) => {
                  if (c.id !== convId) return c;
                  const msgs = c.messages;
                  const lastIdx = msgs.length - 1;
                  const last = msgs[lastIdx];
                  if (!last || last.role !== "assistant") return c;
                  const content = ev.blocks.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("");
                  return { ...c, messages: [...msgs.slice(0, lastIdx), { ...last, content, blocks: ev.blocks }] };
                });
                persistConversations(next);
                return { ...s, conversations: next };
              });
              break;
            case "session": setClaudeSession(convId, ev.sessionId); break;
            case "text": flushSync(() => appendDelta(convId, ev.delta)); break;
            case "tool": appendTool(convId, ev.summary); break;
            case "usage": setCostUsd(ev.costUsd); break;
            case "done": setCostUsd(ev.costUsd); if (ev.sessionId) setClaudeSession(convId, ev.sessionId); break;
            case "credits_exhausted": setCreditsExhausted(true); if (ev.sessionId) setClaudeSession(convId, ev.sessionId); break;
            case "error": setError(ev.message); break;
          }
        });
      } catch (e) {
        if (!controller.signal.aborted) {
          setState((s) => ({ ...s, conversations: s.conversations.map((c) => c.id === convId ? { ...c, messages: convo.messages } : c) }));
          setError(e instanceof Error ? e.message : "Reconnect failed.");
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [streaming, appendDelta, appendTool, setClaudeSession, apiBasePath]
  );

  const stop = useCallback(() => {
    const { activeId: convId } = stateRef.current;
    abortRef.current?.abort();
    fetch(`${apiBasePath}?conversationId=${encodeURIComponent(convId)}`, { method: "DELETE" }).catch(() => {});
  }, [apiBasePath]);

  const createConversation = useCallback(() => {
    const c = newConversation();
    setState((s) => {
      const next = [c, ...s.conversations];
      persistConversations(next);
      try { localStorage.setItem(LS_ACTIVE_ID, c.id); } catch { /* ignore */ }
      return { conversations: next, activeId: c.id };
    });
    setCreditsExhausted(false);
    setError(null);
    setCostUsd(0);
  }, []);

  const switchConversation = useCallback((id: string) => {
    const { activeId: currentId } = stateRef.current;
    if (currentId !== id) {
      fetch(`${apiBasePath}?conversationId=${encodeURIComponent(currentId)}`, { method: "DELETE" }).catch(() => {});
      try { sessionStorage.removeItem(SS_RELOAD_CONVO); } catch { /* ignore */ }
    }
    setActiveId(id);
    setCreditsExhausted(false);
    setError(null);
    setCostUsd(0);
  }, [setActiveId, apiBasePath]);

  const renameConversation = useCallback((id: string, name: string) => {
    setConvos((prev) => prev.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c)));
  }, [setConvos]);

  const deleteConversation = useCallback((id: string) => {
    setState((s) => {
      let next = s.conversations.filter((c) => c.id !== id);
      if (!next.length) next = [newConversation()];
      persistConversations(next);
      const newActiveId = s.activeId === id ? next[0].id : s.activeId;
      try { localStorage.setItem(LS_ACTIVE_ID, newActiveId); } catch { /* ignore */ }
      return { conversations: next, activeId: newActiveId };
    });
  }, []);

  return {
    conversations, activeId, messages, model, setModel,
    streaming, creditsExhausted, error, costUsd,
    send, reconnect, stop,
    createConversation, switchConversation, renameConversation, deleteConversation,
  };
}
