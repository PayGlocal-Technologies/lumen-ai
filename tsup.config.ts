import { defineConfig } from "tsup";
import { readFileSync, writeFileSync } from "node:fs";

const CLIENT_BUNDLE = "dist/client/index.js";

export default defineConfig([
  // Server core (Node ESM, no React)
  {
    entry: { "server/index": "src/server/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    target: "node18",
    platform: "node",
    external: ["node-pty"],
    treeshake: true,
    outDir: "dist",
  },
  // Next adapter
  {
    entry: { "next/index": "src/next/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    target: "node18",
    platform: "node",
    external: ["next", "node-pty"],
    treeshake: true,
    outDir: "dist",
  },
  // Types (isomorphic)
  {
    entry: { "types/index": "src/types/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    treeshake: true,
    outDir: "dist",
  },
  // Client (React, browser)
  {
    entry: { "client/index": "src/client/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    target: "es2020",
    platform: "browser",
    external: ["react", "react-dom", "react/jsx-runtime"],
    treeshake: true,
    outDir: "dist",
    // The bundler strips the per-file "use client" directives when bundling them into
    // a single chunk ("Module level directives cause errors when bundled ... ignored"),
    // and it strips a banner directive too. So re-add it *after* the bundle is written,
    // marking the whole client entry as a Client Component boundary for Next.
    onSuccess: async () => {
      const src = readFileSync(CLIENT_BUNDLE, "utf8");
      if (!src.startsWith('"use client"')) {
        writeFileSync(CLIENT_BUNDLE, `"use client";\n${src}`);
      }
    },
  },
]);
