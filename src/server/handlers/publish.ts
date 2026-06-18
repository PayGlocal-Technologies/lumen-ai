import { execFile } from "node:child_process";
import { isLumenEnabled } from "../guards.js";
import type { AgentPublishRequest, AgentPublishResult } from "../../types/index.js";
import type { LumenConfig } from "../config.js";
import { resolveConfig } from "../config.js";

function run(cmd: string, args: string[], cwd: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: (stdout || "").trim(), stderr: (stderr || "").trim() });
    });
  });
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export function createPublishHandler(cfg: LumenConfig = {}) {
  const resolved = resolveConfig(cfg);
  const protectedSet = new Set(resolved.protectedBranches);

  async function POST(req: Request): Promise<Response> {
    if (!isLumenEnabled(resolved)) return new Response(null, { status: 404 });

    let body: AgentPublishRequest;
    try { body = (await req.json()) as AgentPublishRequest; }
    catch { return new Response("Invalid JSON", { status: 400 }); }

    const slug = slugify(body.feature || "");
    if (!slug) return new Response("A feature name is required", { status: 400 });

    const summary = (body.summary || `Design changes for ${body.feature}`).slice(0, 200);

    const head = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], resolved.cwd);
    let branch = head.ok ? head.stdout : "";
    if (!branch || protectedSet.has(branch) || !branch.startsWith("design/")) {
      branch = `design/${slug}`;
      const co = await run("git", ["checkout", "-B", branch], resolved.cwd);
      if (!co.ok) {
        return Response.json({ branch, pushed: false, message: `Could not create branch: ${co.stderr}` } satisfies AgentPublishResult);
      }
    }

    await run("git", ["add", "-A"], resolved.cwd);
    const commit = await run("git", ["commit", "-m", `design: ${summary}`], resolved.cwd);
    if (!commit.ok && !/nothing to commit/i.test(commit.stdout + commit.stderr)) {
      return Response.json({ branch, pushed: false, message: `Could not commit: ${commit.stderr || commit.stdout}` } satisfies AgentPublishResult);
    }

    const push = await run("git", ["push", "-u", "origin", branch], resolved.cwd);
    if (!push.ok) {
      return Response.json({ branch, pushed: false, message: "Committed locally, but could not push. Ask engineering to check your Git access, then try again." } satisfies AgentPublishResult);
    }

    const pr = await run("gh", [
      "pr", "create",
      "--base", "main",
      "--head", branch,
      "--title", `Design: ${body.feature}`,
      "--body", `${summary}\n\n_Submitted from the in-app Design Agent — for engineering integration._`,
    ], resolved.cwd);

    const prUrl = pr.ok ? (pr.stdout.match(/https?:\/\/\S+/)?.[0] ?? undefined) : undefined;

    return Response.json({
      branch,
      prUrl,
      pushed: true,
      message: prUrl
        ? "Pushed and opened a PR for engineering review."
        : "Pushed your branch. Engineering can open the PR for review.",
    } satisfies AgentPublishResult);
  }

  return { POST };
}
