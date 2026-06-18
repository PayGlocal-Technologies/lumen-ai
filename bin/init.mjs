#!/usr/bin/env node
/**
 * npx @payglocal_ui/lumen init
 *
 * Scaffolds the files needed to integrate Lumen into a Next.js App Router app:
 *   LUMEN.md                                       — rules file for the design agent
 *   src/app/api/lumen/[[...lumen]]/route.ts        — single catch-all route handler
 *
 * It also wires the production safety gate into package.json as a `postbuild`
 * script. Existing files are not overwritten, and the gate wiring is idempotent.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

scaffold("src/app/api/lumen/[[...lumen]]/route.ts", `import { createLumenHandler } from "@payglocal_ui/lumen/next";

export const { GET, POST, DELETE, runtime, dynamic } = createLumenHandler({
  // referenceDirs: ["../sibling-repo"],  // read-only reference checkouts
  // secretPatterns: [/my_certs/i],       // extra patterns beyond built-in defaults
});
`);

wireSafetyGate();

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
  A postbuild gate (lumen-assert-no-agent) now guards your production builds.
`);
