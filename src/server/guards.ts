import type { ResolvedConfig } from "./config.js";

export function isLumenEnabled(cfg: ResolvedConfig): boolean {
  return cfg.enabled();
}

export function isSecretPath(p: string, cfg: ResolvedConfig): boolean {
  if (!p) return false;
  const normalized = p.replace(/\\/g, "/");
  return cfg.secretPatterns.some((re) => re.test(normalized));
}

export function isCreditExhaustion(message: string | undefined): boolean {
  if (!message) return false;
  return /credit|usage limit|rate limit|quota|insufficient|out of (credits|tokens)/i.test(message);
}
