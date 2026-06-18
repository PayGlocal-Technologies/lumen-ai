#!/usr/bin/env node
/**
 * npx @payglocal_ui/lumen init
 *
 * Scaffolds the two files needed to integrate Lumen into a Next.js App Router app:
 *   LUMEN.md                                       — rules file for the design agent
 *   src/app/api/lumen/[[...lumen]]/route.ts        — single catch-all route handler
 *
 * Existing files are not overwritten.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

scaffold("src/app/api/lumen/[[...lumen]]/route.ts", `import { createLumenHandler } from "@payglocal_ui/lumen/next";

export const { GET, POST, DELETE, runtime, dynamic } = createLumenHandler({
  // referenceDirs: ["../sibling-repo"],  // read-only reference checkouts
  // secretPatterns: [/my_certs/i],       // extra patterns beyond built-in defaults
});
`);

console.log(`
Done! Next steps:

  1. Add to your root layout (dev-only):
       import { DesignAgentOverlay } from "@payglocal_ui/lumen/client";
       import "@payglocal_ui/lumen/styles.css";
       // ...
       {process.env.NODE_ENV === "development" && <DesignAgentOverlay />}

  2. Edit LUMEN.md to describe your project's conventions.

  3. Run your dev server and click the sparkles badge.

  The agent is reachable at /api/lumen (all sub-routes handled automatically).
`);
