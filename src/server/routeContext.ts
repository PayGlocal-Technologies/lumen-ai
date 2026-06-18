import { access, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { ResolvedConfig } from "./config.js";

async function pathExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function findRouteDir(baseDir: string, target: string, depth = 0): Promise<string | null> {
  if (depth > 5) return null;
  let entries;
  try { entries = await readdir(baseDir, { withFileTypes: true }); } catch { return null; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === target) return join(baseDir, entry.name);
    if (entry.name.startsWith("(") || depth === 0) {
      const sub = await findRouteDir(join(baseDir, entry.name), target, depth + 1);
      if (sub) return sub;
    }
  }
  return null;
}

export async function buildRouteContext(route: string, cfg: ResolvedConfig): Promise<string> {
  const segment = route.split("/").filter((s) => s && !s.startsWith("["))[0];
  if (!segment) return "";

  const cwd = cfg.cwd;
  const appDir = join(cwd, cfg.appDir);
  const featuresDir = join(cwd, cfg.featuresDir);
  const lines: string[] = [`[Page context — designer is currently on ${route}]`];

  const routeDir = await findRouteDir(appDir, segment);
  if (routeDir) {
    for (const name of ["page.tsx", "page.ts"]) {
      const full = join(routeDir, name);
      if (await pathExists(full)) {
        lines.push(`Page file: ${relative(cwd, full)}`);
        break;
      }
    }
  }

  const featureDir = join(featuresDir, segment);
  if (await pathExists(featureDir)) {
    lines.push(`Feature dir: ${cfg.featuresDir}/${segment}/`);
    try {
      const entries = await readdir(featureDir, { withFileTypes: true });
      const rootFiles = entries
        .filter((e) => !e.isDirectory() && /\.(tsx?|jsx?)$/.test(e.name))
        .map((e) => e.name);
      if (rootFiles.length) lines.push(`Feature files: ${rootFiles.join(", ")}`);
      const componentsDir = join(featureDir, "components");
      if (await pathExists(componentsDir)) {
        const compEntries = await readdir(componentsDir, { withFileTypes: true });
        const compFiles = compEntries
          .filter((e) => !e.isDirectory() && /\.(tsx?|jsx?)$/.test(e.name))
          .map((e) => e.name);
        if (compFiles.length) lines.push(`Feature components: ${compFiles.join(", ")}`);
      }
    } catch {
      /* ignore */
    }
  }

  return lines.join("\n");
}
