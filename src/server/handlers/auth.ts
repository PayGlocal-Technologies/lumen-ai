import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { agentEnv, claudeBin } from "../claudeCli.js";
import { isLumenEnabled } from "../guards.js";
import type { AgentAuthStatus } from "../../types/index.js";
import type { LumenConfig } from "../config.js";
import { resolveConfig } from "../config.js";

function readStatus(): AgentAuthStatus {
  try {
    const cfgPath = join(homedir(), ".claude.json");
    if (!existsSync(cfgPath)) return { loggedIn: false };
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8")) as {
      oauthAccount?: { emailAddress?: string; organizationName?: string };
      subscriptionType?: string;
    };
    const acct = cfg.oauthAccount;
    if (!acct?.emailAddress) return { loggedIn: false };
    return {
      loggedIn: true,
      account: acct.emailAddress,
      plan: cfg.subscriptionType ?? acct.organizationName,
    };
  } catch {
    return { loggedIn: false };
  }
}

export function createAuthHandler(cfg: LumenConfig = {}) {
  const resolved = resolveConfig(cfg);

  async function GET(): Promise<Response> {
    if (!isLumenEnabled(resolved)) return new Response(null, { status: 404 });
    return Response.json(readStatus());
  }

  async function POST(req: Request): Promise<Response> {
    if (!isLumenEnabled(resolved)) return new Response(null, { status: 404 });

    let action = "";
    try { ({ action } = (await req.json()) as { action: string }); }
    catch { return new Response("Invalid JSON", { status: 400 }); }

    if (action === "login") {
      const cmd = `cd ${JSON.stringify(resolved.cwd)} && ${JSON.stringify(claudeBin())} login`;
      const script = `tell application "Terminal" to do script ${JSON.stringify(cmd)}\ntell application "Terminal" to activate`;
      execFile("osascript", ["-e", script], () => {});
      return Response.json({ started: true });
    }

    if (action === "logout") {
      await new Promise<void>((resolve) =>
        execFile(claudeBin(), ["logout"], { env: agentEnv() }, () => resolve()),
      );
      return Response.json({ loggedIn: false });
    }

    return new Response("Unknown action", { status: 400 });
  }

  return { GET, POST };
}
