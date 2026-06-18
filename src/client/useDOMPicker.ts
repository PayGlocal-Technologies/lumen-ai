"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SerializedDOMElement } from "../types/index.js";

const FIBER_SKIP = new Set([
  "Fragment", "Suspense", "StrictMode", "Consumer", "Provider",
  "Router", "Routes", "Route", "Context",
]);

function getReactComponentStack(el: Element): string[] {
  const fiberKey = Object.keys(el).find(
    (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalFiber")
  );
  if (!fiberKey) return [];

  const stack: string[] = [];
  let fiber = (el as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown> | null;

  while (fiber && stack.length < 10) {
    const type = fiber.type as (((...args: unknown[]) => unknown) & { displayName?: string; name?: string }) | null;
    if (typeof type === "function") {
      const name = type.displayName ?? type.name;
      if (
        name &&
        !FIBER_SKIP.has(name) &&
        !name.startsWith("_") &&
        name !== stack[stack.length - 1]
      ) {
        stack.push(name);
      }
    }
    fiber = (fiber.return as Record<string, unknown> | null);
  }

  return stack; // innermost → outermost
}

function getAncestorPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current.tagName !== "BODY" && parts.length < 6) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      part += `#${current.id}`;
    } else if (current.className && typeof current.className === "string") {
      const cls = current.className.trim().split(/\s+/).slice(0, 2).join(".");
      if (cls) part += `.${cls}`;
    }
    parts.unshift(part);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

function serializeElement(el: Element): SerializedDOMElement {
  const rect = el.getBoundingClientRect();
  const dataAttributes: Record<string, string> = {};
  for (const attr of el.attributes) {
    if (attr.name.startsWith("data-")) dataAttributes[attr.name] = attr.value;
  }
  const rawHTML = el.outerHTML;
  const outerHTML = rawHTML.length > 500 ? rawHTML.slice(0, 500) + "…" : rawHTML;
  const rawText = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  const textContent = rawText.length > 200 ? rawText.slice(0, 200) + "…" : rawText;

  return {
    tagName: el.tagName.toLowerCase(),
    id: el.id || undefined,
    classList: Array.from(el.classList),
    reactComponentStack: getReactComponentStack(el),
    ancestorPath: getAncestorPath(el),
    outerHTML,
    textContent,
    boundingBox: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    dataAttributes,
  };
}

export function useDOMPicker() {
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<SerializedDOMElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);

  const start = useCallback(() => {
    setPicking(true);
    setSelected(null);
  }, []);

  const cancel = useCallback(() => {
    setPicking(false);
  }, []);

  const clear = useCallback(() => {
    setSelected(null);
  }, []);

  useEffect(() => {
    if (!picking) {
      overlayRef.current?.remove();
      overlayRef.current = null;
      labelRef.current?.remove();
      labelRef.current = null;
      return;
    }

    const overlay = document.createElement("div");
    overlay.style.cssText = [
      "position:fixed",
      "pointer-events:none",
      "z-index:2147483640",
      "border:2px solid #3b82f6",
      "background:rgba(59,130,246,0.08)",
      "border-radius:3px",
      "transition:top 60ms ease,left 60ms ease,width 60ms ease,height 60ms ease",
      "display:none",
    ].join(";");
    document.body.appendChild(overlay);
    overlayRef.current = overlay;

    const label = document.createElement("div");
    label.style.cssText = [
      "position:fixed",
      "pointer-events:none",
      "z-index:2147483641",
      "background:#3b82f6",
      "color:white",
      "font-size:11px",
      "font-family:monospace",
      "padding:2px 6px",
      "border-radius:3px",
      "white-space:nowrap",
      "display:none",
    ].join(";");
    document.body.appendChild(label);
    labelRef.current = label;

    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "crosshair";

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || target === overlay || target === label) return;

      if (target.closest("[data-lumen-panel]")) {
        overlay.style.display = "none";
        label.style.display = "none";
        return;
      }

      const rect = target.getBoundingClientRect();
      overlay.style.display = "block";
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;

      const stack = getReactComponentStack(target);
      const tagLabel = stack[0] ? `<${stack[0]}>` : target.tagName.toLowerCase();
      const firstClass = target.classList[0] ? `.${target.classList[0]}` : "";
      label.textContent = tagLabel + firstClass;
      label.style.display = "block";

      const labelTop = rect.top - 22;
      label.style.left = `${rect.left}px`;
      label.style.top = labelTop >= 0 ? `${labelTop}px` : `${rect.bottom + 4}px`;
    };

    const handleClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.target as Element | null;
      if (!target || target === overlay || target === label) return;

      // Cancel if clicking inside the lumen panel itself
      if (target.closest("[data-lumen-panel]")) {
        setPicking(false);
        return;
      }

      setSelected(serializeElement(target));
      setPicking(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicking(false);
    };

    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.body.style.cursor = prevCursor;
      document.removeEventListener("mouseover", handleMouseOver, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      overlay.remove();
      overlayRef.current = null;
      label.remove();
      labelRef.current = null;
    };
  }, [picking]);

  return { picking, selected, start, cancel, clear };
}
