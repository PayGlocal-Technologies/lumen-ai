/**
 * withLumen — Next.js config wrapper that enables Lumen's dev-only API route.
 *
 * Lumen scaffolds its catch-all route as `route.dev.ts` (not `route.ts`). The
 * `.dev.ts` suffix is only recognised as a route when `dev.ts` is in Next's
 * `pageExtensions`. This wrapper adds the dev extensions in development and
 * leaves them out in a production build — so the agent route, and the heavy
 * deps it pulls in (node-pty, the Claude Code CLI), are compiled in `next dev`
 * but completely excluded from `next build`. No file leaks to production.
 *
 * Usage (next.config.ts / .mjs / .js):
 *
 *   import { withLumen } from "@payglocal_ui/lumen/next";
 *
 *   const nextConfig = { reactStrictMode: true };
 *
 *   export default withLumen(nextConfig);
 *
 * Any `pageExtensions` you already set are preserved; the dev extensions are
 * merged in front of them in development only.
 */

/** The only field withLumen reads/writes; kept structural so any Next config
 *  type (e.g. `NextConfig`) is accepted without an index-signature clash. */
type HasPageExtensions = { pageExtensions?: string[] };

/** Page extensions that make `*.dev.ts(x)` files dev-only routes. */
export const DEV_PAGE_EXTENSIONS = ["dev.ts", "dev.tsx", "dev.js", "dev.jsx"];

/** Next.js' default page extensions, used when the host config sets none. */
const DEFAULT_PAGE_EXTENSIONS = ["ts", "tsx", "js", "jsx"];

export function withLumen<T extends object>(nextConfig: T = {} as T): T {
  // Production build: leave the config untouched. With no `dev.ts` page
  // extension, `route.dev.ts` is not a route and is never compiled in.
  if (process.env.NODE_ENV === "production") return nextConfig;

  const existing =
    (nextConfig as HasPageExtensions).pageExtensions ?? DEFAULT_PAGE_EXTENSIONS;
  const merged = [
    ...DEV_PAGE_EXTENSIONS.filter((ext) => !existing.includes(ext)),
    ...existing,
  ];

  return { ...nextConfig, pageExtensions: merged } as T;
}
