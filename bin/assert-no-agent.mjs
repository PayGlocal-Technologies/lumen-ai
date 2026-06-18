#!/usr/bin/env node
/**
 * Prod-safety gate for @payglocal_ui/lumen.
 *
 * Run after `next build` (e.g. as a `postbuild` script):
 *   next build && lumen-assert-no-agent
 *
 * Fails if any Lumen client code leaked into the production bundle by scanning
 * .next/static for the localStorage sentinel key. The dev-only gate inside
 * DesignAgentOverlay should dead-code-eliminate the whole subtree in prod; if
 * the sentinel is present, the gating regressed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SENTINEL = "lumen:sessionId";
const CLIENT_DIR = join(process.cwd(), ".next", "static");

function walk(dir) {
  let hits = [];
  let entries = [];
  try { entries = readdirSync(dir); } catch { return hits; }
  for (const name of entries) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) hits = hits.concat(walk(full));
    else if (full.endsWith(".js")) {
      if (readFileSync(full, "utf8").includes(SENTINEL)) hits.push(full);
    }
  }
  return hits;
}

const leaks = walk(CLIENT_DIR);
if (leaks.length > 0) {
  console.error("\n✗ Lumen client code leaked into the production bundle:");
  for (const f of leaks) console.error("   " + f);
  console.error(
    "\n  The dev-only gate regressed. Ensure <DesignAgentOverlay> is rendered\n" +
    "  only behind `process.env.NODE_ENV === 'development'`.\n",
  );
  process.exit(1);
}

console.log("✓ Lumen: no agent code found in production bundle.");
