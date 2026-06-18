"use client";

import {
  ArrowUpRight,
  Crosshair,
  Gauge,
  GitPullRequest,
  Loader,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  SendHorizontal,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import type { LucideProps } from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  "arrow-up-right": ArrowUpRight,
  "crosshair": Crosshair,
  "gauge": Gauge,
  "git-pull-request": GitPullRequest,
  "loader": Loader,
  "log-in": LogIn,
  "log-out": LogOut,
  "menu": Menu,
  "message-circle": MessageCircle,
  "paperclip": Paperclip,
  "pencil": Pencil,
  "plus": Plus,
  "send-horizontal": SendHorizontal,
  "sparkles": Sparkles,
  "square": Square,
  "trash-2": Trash2,
  "x": X,
};

export function Icon({ name, className, ...props }: LucideProps & { name: string }) {
  const Component = ICON_MAP[name];
  if (!Component) return null;
  return <Component className={className} {...props} />;
}
