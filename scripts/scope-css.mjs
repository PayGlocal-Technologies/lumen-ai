/**
 * scope-css.mjs
 *
 * Post-processes dist/lumen-raw.css (Tailwind output) to scope every selector
 * under .lumen, producing dist/lumen.css.
 *
 * Rules:
 *  - @layer lumen { … } blocks are left untouched — they contain our hand-
 *    crafted :root, .lumen token rules that must stay on :root for dialog-
 *    portal inheritance.
 *  - @keyframes blocks are left untouched — animations are global by spec.
 *  - html / :host / :root → replaced with .lumen (these are document-root
 *    selectors; we want the styles to apply to our container instead).
 *  - * → .lumen *   (universal, ::before, ::after, ::backdrop handled same)
 *  - .anything, [attr], tagname → .lumen .anything / .lumen [attr] / etc.
 *  - Selectors already starting with .lumen → kept as-is.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawCss = readFileSync(resolve(__dirname, "../dist/lumen-raw.css"), "utf8");

// Split "a, b, :is(c, d)" correctly — respects bracket nesting.
function splitSelectorList(selector) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of selector) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function scopeSingleSelector(sel) {
  sel = sel.trim();
  if (!sel) return sel;

  // Already under .lumen — keep.
  if (sel === ".lumen") return sel;
  if (/^\.lumen[\s.:#\[]/.test(sel)) return sel;

  // Document-root selectors → replace with .lumen.
  if (sel === "html" || sel === ":host" || sel === ":root") return ".lumen";

  // Everything else → descendant of .lumen.
  return `.lumen ${sel}`;
}

function scopeSelector(selectorStr) {
  const parts = splitSelectorList(selectorStr);
  // Deduplicate: html, :host both become .lumen → emit once.
  const seen = new Set();
  const scoped = [];
  for (const s of parts.map(scopeSingleSelector)) {
    if (!seen.has(s)) { seen.add(s); scoped.push(s); }
  }
  return scoped.join(", ");
}

function isInsideLumenLayer(node) {
  let p = node.parent;
  while (p) {
    if (p.type === "atrule" && p.name === "layer" && p.params === "lumen") return true;
    p = p.parent;
  }
  return false;
}

function isInsideKeyframes(node) {
  let p = node.parent;
  while (p) {
    if (p.type === "atrule" && /^(-webkit-|-moz-|-ms-|-o-)?keyframes$/.test(p.name)) return true;
    p = p.parent;
  }
  return false;
}

const scopePlugin = () => ({
  postcssPlugin: "scope-lumen",
  Rule(rule) {
    if (isInsideLumenLayer(rule) || isInsideKeyframes(rule)) return;
    rule.selector = scopeSelector(rule.selector);
  },
});
scopePlugin.postcss = true;

const result = postcss([scopePlugin]).process(rawCss, { from: undefined });
writeFileSync(resolve(__dirname, "../dist/lumen.css"), result.css);
console.log("✓ dist/lumen.css written (selectors scoped to .lumen)");
