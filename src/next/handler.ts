/**
 * Single catch-all handler for @payglocal_ui/lumen.
 *
 * Mount at src/app/api/lumen/[[...lumen]]/route.ts:
 *
 *   // Minimal (no custom config):
 *   export { GET, POST, DELETE, runtime, dynamic } from "@payglocal_ui/lumen/next";
 *
 *   // With custom config:
 *   import { createLumenHandler } from "@payglocal_ui/lumen/next";
 *   export const { GET, POST, DELETE, runtime, dynamic } = createLumenHandler({
 *     referenceDirs: ["../Flux"],
 *     secretPatterns: [/my_certs/i],
 *   });
 *
 * Routes:
 *   GET    /api/lumen            → chat reconnect (SSE)
 *   POST   /api/lumen            → chat send (SSE)
 *   DELETE /api/lumen            → chat stop
 *   GET    /api/lumen/auth       → auth status
 *   POST   /api/lumen/auth       → login / logout
 *   GET    /api/lumen/usage      → usage view
 *   POST   /api/lumen/publish    → git push + PR
 *   POST   /api/lumen/upload     → image upload
 */

import { createChatHandler } from "../server/handlers/chat.js";
import { createAuthHandler } from "../server/handlers/auth.js";
import { createUsageHandler } from "../server/handlers/usage.js";
import { createPublishHandler } from "../server/handlers/publish.js";
import { createUploadHandler } from "../server/handlers/upload.js";
import type { LumenConfig } from "../server/config.js";

// Next.js 15 made params async; 14 kept them sync. Normalise with Promise.resolve.
type RouteCtx = {
  params: { lumen?: string[] } | Promise<{ lumen?: string[] }>;
};

type Handler = (req: Request) => Promise<Response>;

export function createLumenHandler(cfg?: LumenConfig) {
  const chat = createChatHandler(cfg);
  const auth = createAuthHandler(cfg);
  const usage = createUsageHandler(cfg);
  const publish = createPublishHandler(cfg);
  const upload = createUploadHandler(cfg);

  async function segment(ctx: RouteCtx): Promise<string | undefined> {
    const p = await Promise.resolve(ctx.params);
    return p.lumen?.[0];
  }

  const notFound = () => Promise.resolve(new Response(null, { status: 404 }));

  async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
    switch (await segment(ctx)) {
      case undefined: return (chat.GET as Handler)(req);
      case "auth": return (auth.GET as Handler)(req);
      case "usage": return (usage.GET as Handler)(req);
      default: return notFound();
    }
  }

  async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
    switch (await segment(ctx)) {
      case undefined: return (chat.POST as Handler)(req);
      case "auth": return (auth.POST as Handler)(req);
      case "publish": return (publish.POST as Handler)(req);
      case "upload": return (upload.POST as Handler)(req);
      default: return notFound();
    }
  }

  async function DELETE(req: Request, ctx: RouteCtx): Promise<Response> {
    switch (await segment(ctx)) {
      case undefined: return (chat.DELETE as Handler)(req);
      default: return notFound();
    }
  }

  return {
    GET,
    POST,
    DELETE,
    runtime: "nodejs" as const,
    dynamic: "force-dynamic" as const,
  };
}

// Default export with no config — re-export these for the zero-config case.
const _default = createLumenHandler();
export const GET = _default.GET;
export const POST = _default.POST;
export const DELETE = _default.DELETE;
export const runtime = _default.runtime;
export const dynamic = _default.dynamic;
