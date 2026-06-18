"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@payglocal_ui/flux-ui";
import { AGENT_MODELS, type AgentModel } from "../types/index.js";

export function ModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: AgentModel;
  onChange: (m: AgentModel) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AgentModel)} disabled={disabled}>
      <SelectTrigger className="h-8 w-[140px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AGENT_MODELS.map((m) => (
          <SelectItem key={m.value} value={m.value} className="text-xs">
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
