#!/usr/bin/env node
/**
 * npx @payglocal_ui/lumen init
 *
 * Scaffolds the files needed to integrate Lumen into a Next.js App Router app:
 *   LUMEN.md                                       — rules file for the design agent
 *   src/app/api/lumen/[[...lumen]]/route.dev.ts    — DEV-ONLY catch-all route handler
 *
 * The route is scaffolded as `route.dev.ts` (not `route.ts`) so that, paired
 * with `withLumen()` in next.config, it is compiled only in development and is
 * never bundled into a production build — keeping the agent route and its heavy
 * deps (node-pty, the Claude Code CLI) out of `next build` entirely.
 *
 * It also wires the production safety gate into package.json as a `postbuild`
 * script. Existing files are not overwritten, and the gate wiring is idempotent,
 * so this is safe to re-run on every `npm install` (postinstall).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROUTE_DIR = "src/app/api/lumen/[[...lumen]]";
const LEGACY_ROUTE = `${ROUTE_DIR}/route.ts`;
const DEV_ROUTE = `${ROUTE_DIR}/route.dev.ts`;

const ASSERT_CMD = "lumen-assert-no-agent";

// When running as postinstall, npm sets INIT_CWD to the consumer's project root.
// process.cwd() would point inside node_modules/@payglocal_ui/lumen instead.
const cwd =
  process.env.npm_lifecycle_event === "postinstall"
    ? (process.env.INIT_CWD ?? process.cwd())
    : process.cwd();

function scaffold(relPath, content) {
  const full = join(cwd, relPath);
  if (existsSync(full)) {
    console.log(`  skip  ${relPath}  (already exists)`);
    return;
  }
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf8");
  console.log(`  write ${relPath}`);
}

/**
 * Wire the production safety gate into the consumer's package.json.
 *
 * `lumen-assert-no-agent` must run AFTER `next build` (it scans .next/static for
 * leaked agent code), so it belongs in a `postbuild` script — npm runs postbuild
 * automatically after build. Idempotent: adds the script if absent, appends to an
 * existing postbuild that lacks it, and leaves package.json untouched otherwise.
 */
function wireSafetyGate() {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    console.log("  skip  postbuild gate  (no package.json found)");
    return;
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    console.log("  skip  postbuild gate  (package.json is not valid JSON)");
    return;
  }

  pkg.scripts ??= {};
  const existing = pkg.scripts.postbuild;

  if (!existing) {
    pkg.scripts.postbuild = ASSERT_CMD;
  } else if (existing.includes(ASSERT_CMD)) {
    console.log("  skip  postbuild gate  (already wired)");
    return;
  } else {
    pkg.scripts.postbuild = `${existing} && ${ASSERT_CMD}`;
  }

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log(`  write package.json  (postbuild: "${pkg.scripts.postbuild}")`);
}

console.log("\nScaffolding @payglocal_ui/lumen into your app…\n");

scaffold("LUMEN.md", `# Project rules for the Lumen design agent

<!-- Edit this file to teach the agent your project's conventions. -->
<!-- It is re-read on every message, so changes take effect immediately. -->

## Component library
<!-- e.g. Use components from @/components/ui (shadcn/ui). Never use bare HTML. -->

## Import aliases
<!-- e.g. Always use the \`@/\` path alias for internal imports. -->

## Folder structure
<!-- e.g. Feature code lives in src/features/<feature-name>/. -->
`);

scaffold(DEV_ROUTE, `import { createLumenHandler } from "@payglocal_ui/lumen/next";

// This file is named *.dev.ts so it is only compiled as a route in development
// (see withLumen() in next.config). It is never included in a production build.
export const { GET, POST, DELETE, runtime, dynamic } = createLumenHandler({
  // referenceDirs: ["../sibling-repo"],  // read-only reference checkouts
  // secretPatterns: [/my_certs/i],       // extra patterns beyond built-in defaults
});
`);

// Warn if a legacy always-shipped route.ts is still present from an older install.
if (existsSync(join(cwd, LEGACY_ROUTE))) {
  console.log(
    `  WARN  ${LEGACY_ROUTE} exists — this ships the agent route to production.\n` +
    `        Delete it and keep ${DEV_ROUTE} instead.`,
  );
}

wireSafetyGate();

console.log(`
Done! Next steps:

  1. Wrap your next.config with withLumen so the dev-only route.dev.ts is
     compiled in dev and excluded from production builds:

       import { withLumen } from "@payglocal_ui/lumen/next";

       const nextConfig = { /* ...your config... */ };

       export default withLumen(nextConfig);

  2. Add the overlay to your root layout. Create a small dev-only wrapper that
     imports the agent AND its styles together, then dynamic-import the wrapper.
     (Importing the .css directly inside next/dynamic fails under Turbopack, and
     a static import would ship the agent to production.)

       // src/components/LumenOverlay.tsx
       "use client";
       import { DesignAgentOverlay } from "@payglocal_ui/lumen/client";
       import "@payglocal_ui/lumen/styles.css";
       export default DesignAgentOverlay;

       // src/app/layout.tsx
       import dynamic from "next/dynamic";
       const DesignAgentOverlay =
         process.env.NODE_ENV === "development"
           ? dynamic(() => import("@/components/LumenOverlay"))
           : null;

       // ...inside <body>:
       {DesignAgentOverlay && <DesignAgentOverlay />}

  3. Edit LUMEN.md to describe your project's conventions.

  4. Run your dev server and click the sparkles badge.

  The agent is reachable at /api/lumen (all sub-routes handled automatically).
  A postbuild gate (lumen-assert-no-agent) now guards your production builds.
`);
