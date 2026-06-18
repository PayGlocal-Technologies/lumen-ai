import { readFile, unlink } from "node:fs/promises";
import { extname } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { agentEnv, buildChatArgs, claudeBin } from "../claudeCli.js";
import { isCreditExhaustion, isLumenEnabled } from "../guards.js";
import { buildSystemPrompt } from "../prompt.js";
import { buildRouteContext } from "../routeContext.js";
import { setSessionId } from "../sessionStore.js";
import { DEFAULT_MODEL, type AgentChatRequest, type AgentEvent, type SerializedDOMElement, type SnapshotBlock } from "../../types/index.js";
import type { LumenConfig, ResolvedConfig } from "../config.js";
import { resolveConfig } from "../config.js";

interface ActiveSession {
  child?: ChildProcess;
  controllers: Set<ReadableStreamDefaultController<Uint8Array>>;
  snapshot: SnapshotBlock[];
  claudeSessionId?: string;
  costUsd: number;
  done: boolean;
  encoder: TextEncoder;
  idleTimeout?: ReturnType<typeof setTimeout>;
}

declare global {
  var __lumenSessions: Map<string, ActiveSession> | undefined;
}

const activeSessions: Map<string, ActiveSession> =
  global.__lumenSessions ?? (global.__lumenSessions = new Map());

const IDLE_TTL_MS = 15 * 60 * 1000;

function scheduleIdleKill(convId: string, session: ActiveSession): void {
  clearTimeout(session.idleTimeout);
  session.idleTimeout = setTimeout(() => {
    if (!session.done) session.child?.kill("SIGTERM");
    for (const ctrl of session.controllers) { try { ctrl.close(); } catch {} }
    activeSessions.delete(convId);
  }, IDLE_TTL_MS);
}

function cancelIdleKill(session: ActiveSession): void {
  clearTimeout(session.idleTimeout);
  session.idleTimeout = undefined;
}

function broadcastEncoded(session: ActiveSession, encoded: Uint8Array): void {
  for (const ctrl of session.controllers) {
    try { ctrl.enqueue(encoded); } catch { session.controllers.delete(ctrl); }
  }
}

function broadcastEvent(session: ActiveSession, event: AgentEvent): void {
  if (event.type === "text") {
    const last = session.snapshot[session.snapshot.length - 1];
    if (last?.type === "text") { last.text += event.delta; }
    else { session.snapshot.push({ type: "text", text: event.delta }); }
  } else if (event.type === "tool") {
    const last = session.snapshot[session.snapshot.length - 1];
    if (!(last?.type === "tool" && last.summary === event.summary)) {
      session.snapshot.push({ type: "tool", summary: event.summary });
    }
  } else if (event.type === "session") {
    session.claudeSessionId = event.sessionId;
  } else if (event.type === "done") {
    if (event.sessionId) session.claudeSessionId = event.sessionId;
    session.costUsd = event.costUsd;
  }
  broadcastEncoded(session, session.encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
} as const;

function formatElementContext(el: SerializedDOMElement): string {
  const lines = ["[Selected DOM Element — the user is referring to this specific component]"];
  if (el.reactComponentStack.length > 0) {
    lines.push(`Component stack (innermost → outermost): ${el.reactComponentStack.join(" → ")}`);
  }
  const tagLine =
    el.tagName +
    (el.classList.length ? `.${el.classList.slice(0, 3).join(".")}` : "") +
    (el.id ? `#${el.id}` : "");
  lines.push(`Element: ${tagLine}`);
  lines.push(`DOM path: ${el.ancestorPath}`);
  lines.push(`Size: ${el.boundingBox.width}×${el.boundingBox.height}px at (${el.boundingBox.x}, ${el.boundingBox.y})`);
  lines.push(`HTML: ${el.outerHTML}`);
  if (el.textContent) lines.push(`Text: "${el.textContent}"`);
  return lines.join("\n");
}

function toolSummary(name: string): string {
  switch (name) {
    case "Read": case "Glob": case "Grep": return "Looking through the code…";
    case "Edit": case "Write": return "Updating the UI…";
    case "Bash": return "Running a check…";
    default: return "Working…";
  }
}

export function createChatHandler(cfg: LumenConfig = {}) {
  const resolved: ResolvedConfig = resolveConfig(cfg);

  async function DELETE(req: Request): Promise<Response> {
    if (!isLumenEnabled(resolved)) return new Response(null, { status: 404 });
    const url = new URL(req.url);
    const convId = url.searchParams.get("conversationId");
    if (!convId) return new Response("Missing conversationId", { status: 400 });
    const session = activeSessions.get(convId);
    if (session) {
      clearTimeout(session.idleTimeout);
      if (!session.done) session.child?.kill("SIGTERM");
      for (const ctrl of session.controllers) { try { ctrl.close(); } catch {} }
      activeSessions.delete(convId);
    }
    return new Response(null, { status: 204 });
  }

  async function GET(req: Request): Promise<Response> {
    if (!isLumenEnabled(resolved)) return new Response(null, { status: 404 });
    const url = new URL(req.url);
    const convId = url.searchParams.get("conversationId");
    if (!convId) return new Response("Missing conversationId", { status: 400 });
    const session = activeSessions.get(convId);
    if (!session) return new Response("No active session", { status: 404 });
    const { encoder } = session;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        cancelIdleKill(session);
        const resumeEvent: AgentEvent = {
          type: "resume",
          claudeSessionId: session.claudeSessionId,
          blocks: session.snapshot,
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(resumeEvent)}\n\n`));
        if (session.done) {
          const doneEvent: AgentEvent = {
            type: "done",
            sessionId: session.claudeSessionId ?? "",
            costUsd: session.costUsd,
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`));
          controller.close();
          return;
        }
        session.controllers.add(controller);
        req.signal.addEventListener("abort", () => {
          session.controllers.delete(controller);
          try { controller.close(); } catch {}
          if (session.controllers.size === 0 && !session.done) scheduleIdleKill(convId, session);
        });
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  }

  async function POST(req: Request): Promise<Response> {
    if (!isLumenEnabled(resolved)) return new Response(null, { status: 404 });

    let body: AgentChatRequest;
    try { body = (await req.json()) as AgentChatRequest; }
    catch { return new Response("Invalid JSON", { status: 400 }); }

    const prompt = (body.prompt ?? "").trim();
    const imagePath = body.imagePath;
    if (!prompt && !imagePath) return new Response("Empty prompt", { status: 400 });

    let imageBase64: string | undefined;
    let imageMimeType: string | undefined;
    if (imagePath) {
      const buf = await readFile(imagePath);
      imageBase64 = buf.toString("base64");
      const ext = extname(imagePath).toLowerCase();
      imageMimeType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
        : ext === ".png" ? "image/png"
        : ext === ".gif" ? "image/gif"
        : "image/webp";
    }

    const sessionId = body.sessionId;
    const convId = body.conversationId;

    const routeCtx = body.currentRoute
      ? await buildRouteContext(body.currentRoute, resolved)
      : "";
    const elementCtx = body.selectedElement ? formatElementContext(body.selectedElement) : "";
    const fullPrompt = [routeCtx, elementCtx, prompt].filter(Boolean).join("\n\n---\n\n");

    if (convId) {
      const old = activeSessions.get(convId);
      if (old && !old.done) {
        old.child?.kill("SIGTERM");
        for (const ctrl of old.controllers) { try { ctrl.close(); } catch {} }
        activeSessions.delete(convId);
      }
    }

    const systemAppend = buildSystemPrompt(resolved);
    const { args, stdinData } = buildChatArgs(
      { prompt: fullPrompt, model: body.model ?? DEFAULT_MODEL, systemAppend, sessionId, imageBase64, imageMimeType },
      resolved,
    );

    const encoder = new TextEncoder();
    const session: ActiveSession = {
      controllers: new Set(),
      snapshot: [],
      claudeSessionId: sessionId,
      costUsd: 0,
      done: false,
      encoder,
    };
    if (convId) activeSessions.set(convId, session);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        session.controllers.add(controller);
        const child = spawn(claudeBin(), args, { cwd: resolved.cwd, env: agentEnv() });
        session.child = child;

        if (stdinData) { child.stdin.write(stdinData, "utf8"); child.stdin.end(); }

        let stdoutBuf = "";
        let stderrBuf = "";
        let activeSessionId = sessionId;
        let lastCost = 0;
        let finished = false;
        const finishedBlocks = new Set<number>();

        const finish = () => {
          if (finished) return;
          finished = true;
          session.done = true;
          if (convId) setTimeout(() => activeSessions.delete(convId), 60_000);
          if (imagePath) unlink(imagePath).catch(() => {});
          for (const ctrl of session.controllers) { try { ctrl.close(); } catch {} }
          session.controllers.clear();
        };

        req.signal.addEventListener("abort", () => {
          session.controllers.delete(controller);
          try { controller.close(); } catch {}
          if (convId && session.controllers.size === 0 && !session.done) scheduleIdleKill(convId, session);
        });

        const handleLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          let msg: Record<string, unknown>;
          try { msg = JSON.parse(trimmed) as Record<string, unknown>; } catch { return; }

          const type = msg.type as string | undefined;

          if (type === "system" && msg.subtype === "init" && typeof msg.session_id === "string") {
            activeSessionId = msg.session_id;
            setSessionId(resolved, activeSessionId);
            broadcastEvent(session, { type: "session", sessionId: activeSessionId });
            return;
          }

          if (type === "stream_event") {
            const ev = msg.event as { type?: string; index?: number; delta?: { type?: string; text?: string }; content_block?: { type?: string; name?: string } } | undefined;
            const blockIdx = ev?.index ?? -1;
            if (ev?.type === "message_start") { finishedBlocks.clear(); }
            else if (ev?.type === "content_block_stop") { if (blockIdx >= 0) finishedBlocks.add(blockIdx); }
            else if (ev?.type === "content_block_delta" && !finishedBlocks.has(blockIdx) && ev.delta?.type === "text_delta" && ev.delta.text) {
              broadcastEvent(session, { type: "text", delta: ev.delta.text });
            } else if (ev?.type === "content_block_start" && !finishedBlocks.has(blockIdx) && ev.content_block?.type === "tool_use") {
              const name = ev.content_block.name ?? "tool";
              broadcastEvent(session, { type: "tool", name, summary: toolSummary(name) });
            }
            return;
          }

          if (type === "result") {
            const usage = msg.usage as { input_tokens?: number; output_tokens?: number } | undefined;
            lastCost = (msg.total_cost_usd as number) ?? lastCost;
            if (usage) {
              broadcastEvent(session, { type: "usage", inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0, costUsd: lastCost });
            }
            if (typeof msg.session_id === "string") {
              activeSessionId = msg.session_id;
              setSessionId(resolved, activeSessionId);
            }
            const resultText = typeof msg.result === "string" ? msg.result : "";
            if (msg.is_error && isCreditExhaustion(resultText)) {
              broadcastEvent(session, { type: "credits_exhausted", sessionId: activeSessionId, message: resultText });
            }
            return;
          }
        };

        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          stdoutBuf += chunk;
          let nl: number;
          while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
            const line = stdoutBuf.slice(0, nl);
            stdoutBuf = stdoutBuf.slice(nl + 1);
            handleLine(line);
          }
        });

        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk: string) => { stderrBuf += chunk; });

        child.on("error", (err) => {
          broadcastEvent(session, { type: "error", message: `Could not start Claude Code. Is it installed and are you logged in? (${err.message})` });
          finish();
        });

        child.on("close", (code) => {
          if (stdoutBuf.trim()) handleLine(stdoutBuf);
          if (code !== 0 && !finished) {
            if (isCreditExhaustion(stderrBuf)) {
              broadcastEvent(session, { type: "credits_exhausted", sessionId: activeSessionId, message: stderrBuf.trim() });
            } else {
              broadcastEvent(session, { type: "error", message: stderrBuf.trim() || `Agent exited with code ${code}.` });
            }
          } else if (!finished) {
            broadcastEvent(session, { type: "done", sessionId: activeSessionId ?? "", costUsd: lastCost });
          }
          finish();
        });
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  }

  return { POST, GET, DELETE };
}
