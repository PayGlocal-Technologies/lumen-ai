import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedConfig } from "./config.js";

type Store = Record<string, string>;

function dir(cwd: string) { return join(cwd, ".design-agent"); }
function file(cwd: string) { return join(dir(cwd), "sessions.json"); }

function read(cwd: string): Store {
  try {
    if (!existsSync(file(cwd))) return {};
    return JSON.parse(readFileSync(file(cwd), "utf8")) as Store;
  } catch {
    return {};
  }
}

function write(cwd: string, store: Store): void {
  if (!existsSync(dir(cwd))) mkdirSync(dir(cwd), { recursive: true });
  writeFileSync(file(cwd), JSON.stringify(store, null, 2), "utf8");
}

export function currentBranch(cwd: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf8",
    }).trim();
  } catch {
    return "detached";
  }
}

export function getSessionId(cfg: ResolvedConfig, branch?: string): string | undefined {
  return read(cfg.cwd)[branch ?? currentBranch(cfg.cwd)];
}

export function setSessionId(cfg: ResolvedConfig, sessionId: string, branch?: string): void {
  if (!sessionId) return;
  const store = read(cfg.cwd);
  store[branch ?? currentBranch(cfg.cwd)] = sessionId;
  write(cfg.cwd, store);
}
