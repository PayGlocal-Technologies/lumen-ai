/**
 * Next.js App Router adapter for @payglocal_ui/lumen.
 *
 * ── Zero-config (re-export defaults, no custom rules):
 *
 *   // src/app/api/lumen/[[...lumen]]/route.ts
 *   export { GET, POST, DELETE, runtime, dynamic } from "@payglocal_ui/lumen/next";
 *
 * ── With custom config (referenceDirs, secretPatterns, etc.):
 *
 *   // src/app/api/lumen/[[...lumen]]/route.ts
 *   import { createLumenHandler } from "@payglocal_ui/lumen/next";
 *   export const { GET, POST, DELETE, runtime, dynamic } = createLumenHandler({
 *     referenceDirs: ["../Flux", "../pg-dashboard"],
 *     secretPatterns: [/uidai_certs?_?js/i],
 *   });
 *
 * The single [[...lumen]] catch-all handles all sub-paths:
 *   /api/lumen          → chat (SSE)
 *   /api/lumen/auth     → login/logout/status
 *   /api/lumen/usage    → usage view
 *   /api/lumen/publish  → git push + PR
 *   /api/lumen/upload   → image upload
 */

export type { LumenConfig } from "../server/index.js";

// Single catch-all handler (recommended)
export { createLumenHandler, GET, POST, DELETE, runtime, dynamic } from "./handler.js";

// Individual route factories (kept for consumers who prefer explicit sub-routes)
import { createChatHandler } from "../server/handlers/chat.js";
import { createAuthHandler } from "../server/handlers/auth.js";
import { createUsageHandler } from "../server/handlers/usage.js";
import { createPublishHandler } from "../server/handlers/publish.js";
import { createUploadHandler } from "../server/handlers/upload.js";
import type { LumenConfig } from "../server/config.js";

const ROUTE_OPTS = {
  runtime: "nodejs" as const,
  dynamic: "force-dynamic" as const,
};

export function createChatRoute(cfg?: LumenConfig) {
  return { ...createChatHandler(cfg), ...ROUTE_OPTS };
}

export function createAuthRoute(cfg?: LumenConfig) {
  return { ...createAuthHandler(cfg), ...ROUTE_OPTS };
}

export function createUsageRoute(cfg?: LumenConfig) {
  return { ...createUsageHandler(cfg), ...ROUTE_OPTS };
}

export function createPublishRoute(cfg?: LumenConfig) {
  return { ...createPublishHandler(cfg), ...ROUTE_OPTS };
}

export function createUploadRoute(cfg?: LumenConfig) {
  return { ...createUploadHandler(cfg), runtime: "nodejs" as const };
}
