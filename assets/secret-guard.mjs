#!/usr/bin/env node
/**
 * PreToolUse hook for the Design Agent (Lumen). Claude Code pipes a JSON event
 * on stdin before every Read/Edit/Write/Bash call. We deny (exit code 2) any
 * attempt to touch secret/credential material.
 *
 * Exit 0 = allow. Exit 2 = block (stderr is shown back to the model).
 *
 * Consumer-specific patterns are passed in via the LUMEN_SECRET_PATTERNS env
 * var as a JSON array of {source, flags} objects (serialized RegExp descriptors).
 * These are merged with the built-in defaults below.
 */

const DEFAULT_PATTERNS = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)\.git\/config$/i,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /(^|\/)(secrets?|credentials?)(\/|\.|$)/i,
  /id_rsa|id_ed25519|\.ssh\//i,
  /\.npmrc$/i,
];

let SECRET_PATTERNS = [...DEFAULT_PATTERNS];

try {
  const raw = process.env.LUMEN_SECRET_PATTERNS;
  if (raw) {
    const extra = JSON.parse(raw);
    if (Array.isArray(extra)) {
      for (const { source, flags } of extra) {
        if (typeof source === "string") {
          SECRET_PATTERNS.push(new RegExp(source, flags ?? ""));
        }
      }
    }
  }
} catch {
  // Malformed env var → fall back to defaults only.
}

const isSecret = (s) =>
  typeof s === "string" && SECRET_PATTERNS.some((re) => re.test(s.replace(/\\/g, "/")));

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    setTimeout(() => resolve(data), 2000);
  });
}

const raw = await readStdin();
let event = {};
try {
  event = JSON.parse(raw || "{}");
} catch {
  process.exit(0);
}

const input = event.tool_input ?? {};
const candidates = [input.file_path, input.path, input.notebook_path, input.command]
  .flat()
  .filter(Boolean);

if (candidates.some(isSecret)) {
  process.stderr.write(
    "Blocked: this path is protected (secrets/credentials/certs). The agent must not read or modify it.",
  );
  process.exit(2);
}

process.exit(0);
