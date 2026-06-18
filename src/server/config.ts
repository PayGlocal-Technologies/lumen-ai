/**
 * LumenConfig — the single configuration object threaded through all server
 * functions. Every field has a sensible default so `{}` works out-of-the-box
 * for a standard Next.js App Router app with `src/app` + `src/features`.
 */

export interface LumenConfig {
  /**
   * Path to a Markdown file containing repo-specific rules appended to the
   * agent's base prompt. Mirrors how Claude Code loads CLAUDE.md.
   * Default: "LUMEN.md" (relative to cwd).
   */
  rulesFile?: string;

  /**
   * Escape hatch: replace the global base prompt entirely.
   * Prefer `rulesFile` for repo-specific additions.
   */
  systemPromptOverride?: string;

  /**
   * Additional read-only reference directories the agent may inspect.
   * Typically sibling repos (design system, legacy app).
   * Default: [] (no extra dirs).
   */
  referenceDirs?: string[];

  /**
   * Tools the agent is allowed to use. Anything not in this list is silently
   * denied (dontAsk mode). Default covers read/edit/write and safe git/lint.
   */
  allowedTools?: string[];

  /**
   * Extra RegExp patterns for paths the secret-guard hook must block.
   * Merged with the built-in defaults (env files, SSH keys, PEM certs, npmrc).
   */
  secretPatterns?: RegExp[];

  /**
   * App directory (Next.js route files). Default: "src/app".
   */
  appDir?: string;

  /**
   * Feature directory (domain modules). Default: "src/features".
   */
  featuresDir?: string;

  /**
   * Whether the agent is enabled. Called on every request.
   * Default: NODE_ENV === "development" && NEXT_PUBLIC_ENV !== "production".
   */
  enabled?: () => boolean;

  /**
   * Working directory for all file and git operations. Default: process.cwd().
   */
  cwd?: string;

  /**
   * Branches the publish route must NOT commit directly to.
   * Default: ["main", "master", "develop", "production"].
   */
  protectedBranches?: string[];
}

export const DEFAULT_ALLOWED_TOOLS = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash(npm run lint)",
  "Bash(npm run build)",
  "Bash(git status:*)",
  "Bash(git diff:*)",
];

export const DEFAULT_SECRET_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)\.git\/config$/i,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /(^|\/)(secrets?|credentials?)(\/|\.|$)/i,
  /id_rsa|id_ed25519|\.ssh\//i,
  /\.npmrc$/i,
];

export const DEFAULT_PROTECTED_BRANCHES = ["main", "master", "develop", "production"];

/** Resolve a LumenConfig to fully-specified values with all defaults applied. */
export function resolveConfig(cfg: LumenConfig = {}) {
  return {
    rulesFile: cfg.rulesFile ?? "LUMEN.md",
    systemPromptOverride: cfg.systemPromptOverride,
    referenceDirs: cfg.referenceDirs ?? [],
    allowedTools: cfg.allowedTools ?? DEFAULT_ALLOWED_TOOLS,
    secretPatterns: [...DEFAULT_SECRET_PATTERNS, ...(cfg.secretPatterns ?? [])],
    appDir: cfg.appDir ?? "src/app",
    featuresDir: cfg.featuresDir ?? "src/features",
    enabled: cfg.enabled ?? (() => process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_ENV !== "production"),
    cwd: cfg.cwd ?? process.cwd(),
    protectedBranches: cfg.protectedBranches ?? DEFAULT_PROTECTED_BRANCHES,
  };
}

export type ResolvedConfig = ReturnType<typeof resolveConfig>;
