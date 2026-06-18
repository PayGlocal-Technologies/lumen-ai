import { agentEnv, claudeBin } from "../claudeCli.js";
import { isLumenEnabled } from "../guards.js";
import type { AgentUsageResult } from "../../types/index.js";
import type { LumenConfig } from "../config.js";
import { resolveConfig } from "../config.js";

const ACCOUNT_USAGE_URL = "https://claude.ai/settings/usage";
const ANSI = new RegExp("\\u001b\\[[0-9;?]*[ -/]*[@-~]|\\u001b\\][^\\u0007]*\\u0007", "g");

function fallback(): Response {
  return Response.json({ kind: "fallback", accountUrl: ACCOUNT_USAGE_URL } satisfies AgentUsageResult);
}

export function createUsageHandler(cfg: LumenConfig = {}) {
  const resolved = resolveConfig(cfg);

  async function GET(): Promise<Response> {
    if (!isLumenEnabled(resolved)) return new Response(null, { status: 404 });

    let pty: { spawn: (file: string, args: string[], opts: Record<string, unknown>) => PtyProcess };
    try {
      const moduleName = "node-pty";
      pty = (await import(moduleName)) as unknown as typeof pty;
    } catch {
      return fallback();
    }

    try {
      return Response.json({ kind: "view", text: await captureUsage(pty, resolved.cwd) } satisfies AgentUsageResult);
    } catch {
      return fallback();
    }
  }

  return { GET };
}

interface PtyProcess {
  onData: (cb: (d: string) => void) => void;
  onExit: (cb: () => void) => void;
  write: (data: string) => void;
  kill: () => void;
}

function captureUsage(
  pty: { spawn: (file: string, args: string[], opts: Record<string, unknown>) => PtyProcess },
  cwd: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const term = pty.spawn(claudeBin(), [], {
      name: "xterm-color",
      cols: 100,
      rows: 40,
      cwd,
      env: agentEnv(),
    });

    let buf = "";
    term.onData((d) => (buf += d));

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => term.write("/usage\r"), 1200));
    timers.push(
      setTimeout(() => {
        try { term.kill(); } catch { /* noop */ }
        const clean = buf.replace(ANSI, "").replace(/\r/g, "").trim();
        if (clean) resolve(clean);
        else reject(new Error("empty"));
      }, 4000),
    );

    term.onExit(() => timers.forEach(clearTimeout));
  });
}
