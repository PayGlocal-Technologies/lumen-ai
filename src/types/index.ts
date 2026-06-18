/**
 * Shared types for @payglocal_ui/lumen. Isomorphic — no Node-only imports.
 */

export type AgentModel = "sonnet" | "opus" | "haiku";

export interface AgentModelOption {
  value: AgentModel;
  label: string;
  hint: string;
}

export const AGENT_MODELS: AgentModelOption[] = [
  { value: "sonnet", label: "Sonnet 4.6", hint: "Fast, strong default" },
  { value: "opus", label: "Opus 4.8", hint: "Hardest screens" },
  { value: "haiku", label: "Haiku 4.5", hint: "Cheap iterations" },
];

export const DEFAULT_MODEL: AgentModel = "sonnet";

export interface SerializedDOMElement {
  tagName: string;
  id?: string;
  classList: string[];
  reactComponentStack: string[];
  ancestorPath: string;
  outerHTML: string;
  textContent: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  dataAttributes: Record<string, string>;
}

export interface AgentChatRequest {
  prompt: string;
  model?: AgentModel;
  sessionId?: string;
  imagePath?: string;
  conversationId?: string;
  currentRoute?: string;
  selectedElement?: SerializedDOMElement;
}

export type SnapshotBlock =
  | { type: "text"; text: string }
  | { type: "tool"; summary: string };

export type AgentEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; summary: string }
  | { type: "usage"; inputTokens: number; outputTokens: number; costUsd: number }
  | { type: "done"; sessionId: string; costUsd: number }
  | { type: "resume"; claudeSessionId?: string; blocks: SnapshotBlock[] }
  | { type: "credits_exhausted"; sessionId?: string; message: string }
  | { type: "error"; message: string };

export interface AgentAuthStatus {
  loggedIn: boolean;
  account?: string;
  plan?: string;
}

export interface AgentUsageResult {
  kind: "view" | "fallback";
  text?: string;
  accountUrl?: string;
}

export interface AgentPublishRequest {
  feature: string;
  summary: string;
}

export interface AgentPublishResult {
  branch: string;
  prUrl?: string;
  pushed: boolean;
  message: string;
}
