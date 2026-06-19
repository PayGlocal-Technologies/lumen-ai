"use client";

import { motion, useDragControls, useMotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Button } from "@payglocal_ui/flux-ui";
import { Icon } from "./icon.js";
import { ChatPanel } from "./ChatPanel.js";

const LS_POS = "lumen:pos";
const LS_OPEN = "lumen:open";

export function DesignAgentOverlay({ apiBasePath = "/api/lumen" }: { apiBasePath?: string }) {
  if (process.env.NODE_ENV !== "development") return null;
  return <Overlay apiBasePath={apiBasePath} />;
}

function Overlay({ apiBasePath }: { apiBasePath: string }) {
  const [open, setOpen] = useState(false);
  const [moved, setMoved] = useState(false);
  const bounds = useRef<HTMLDivElement>(null);
  const controls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    try {
      if (localStorage.getItem(LS_OPEN) === "1") {
        timer = setTimeout(() => setOpen(true), 0);
      }
    } catch { /* ignore */ }
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(LS_OPEN, open ? "1" : "0"); } catch { /* ignore */ }
  }, [open]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_POS);
      if (saved) {
        const p = JSON.parse(saved) as { x: number; y: number };
        x.set(p.x);
        y.set(p.y);
      }
    } catch { /* ignore */ }
  }, [x, y]);

  const persist = () => {
    try {
      localStorage.setItem(LS_POS, JSON.stringify({ x: x.get(), y: y.get() }));
    } catch { /* ignore */ }
  };

  return (
    // display:contents makes this a zero-layout "phantom" wrapper: it has no
    // box so it doesn't affect positioning, but it IS a real DOM ancestor, so
    // .lumen descendant selectors and CSS variable inheritance both work through
    // it — giving the overlay its own token scope without touching :root.
    <div className="lumen" style={{ display: "contents" }}>
    <div ref={bounds} className="pointer-events-none fixed inset-0 z-[2147483600]">
      <motion.div
        drag
        dragControls={controls}
        dragListener={false}
        dragConstraints={bounds}
        dragMomentum={false}
        dragElastic={0}
        onDragStart={() => setMoved(true)}
        onDragEnd={persist}
        style={{ x, y }}
        className="pointer-events-auto fixed bottom-6 right-6"
      >
        {open ? (
          <ChatPanel
            apiBasePath={apiBasePath}
            onClose={() => setOpen(false)}
            onDragHandlePointerDown={(e) => controls.start(e)}
          />
        ) : (
          <Button
            aria-label="Open Design Agent"
            onPointerDown={(e: React.PointerEvent) => {
              setMoved(false);
              controls.start(e);
            }}
            onClick={() => {
              if (!moved) setOpen(true);
            }}
            className="h-12 w-12 rounded-full p-0 shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            <Icon name="sparkles" className="h-5 w-5" />
          </Button>
        )}
      </motion.div>
    </div>
    </div>
  );
}
