# @payglocal_ui/lumen

> Dev-only in-app AI design agent — powered by Claude Code.

Lumen embeds a draggable chat overlay into your Next.js App Router app during
development. Designers and engineers describe UI changes in natural language,
and Claude Code applies them as real code edits in your repo — live, with no
context switch to a terminal.

It is **development-only by design**: the overlay renders and the agent runs
only in development. Production builds dead-code-eliminate the agent, and a
build-time gate (`lumen-assert-no-agent`) fails the build if any agent code
leaks into a production bundle.

## Requirements

- A **Next.js** app using the App Router
- **React** 18 or 19
- The [Claude Code CLI](https://docs.claude.com/en/docs/claude-code) installed
  and authenticated (the agent shells out to it)

## Install

```bash
npm install --save-dev @payglocal_ui/lumen
```

A `postinstall` hook scaffolds the two integration files automatically (it
skips files that already exist). To run it manually:

```bash
npx lumen
```

This creates:

- `LUMEN.md` — your project's rules file (re-read on every message)
- `src/app/api/lumen/[[...lumen]]/route.ts` — the catch-all API route

It also wires the production safety gate into your `package.json` as a
`postbuild` script (`lumen-assert-no-agent`), so production builds are guarded
automatically. This is idempotent — it won't duplicate or clobber an existing
`postbuild`.

> If you install with `--ignore-scripts` (common in CI), the `postinstall`
> hook won't run — use `npx lumen` to scaffold manually.

## Setup

### 1. API route

The scaffolder generates `src/app/api/lumen/[[...lumen]]/route.ts`:

```ts
import { createLumenHandler } from "@payglocal_ui/lumen/next";

export const { GET, POST, DELETE, runtime, dynamic } = createLumenHandler({
  // referenceDirs: ["../sibling-repo"],  // read-only reference checkouts
  // secretPatterns: [/my_certs/i],       // extra patterns beyond built-in defaults
});
```

### 2. Root layout

Add the overlay to your root layout using a **conditional dynamic import**, so
the bundler dead-code-eliminates the agent (and its styles) from production
builds:

```tsx
import dynamic from "next/dynamic";

// Dev-only. A conditional dynamic import keeps the agent out of prod bundles.
const DesignAgentOverlay =
  process.env.NODE_ENV === "development"
    ? dynamic(() =>
        Promise.all([
          import("@payglocal_ui/lumen/client"),
          import("@payglocal_ui/lumen/styles.css"),
        ]).then(([m]) => m.DesignAgentOverlay),
      )
    : null;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {DesignAgentOverlay && <DesignAgentOverlay />}
      </body>
    </html>
  );
}
```

> **Do not use a static `import { DesignAgentOverlay } from ".../client"`.** A
> static import ships the entire `"use client"` module to production even when
> the render is gated behind `NODE_ENV` — the `postbuild` safety gate will catch
> this and fail your build. The conditional dynamic import above is required.

### 3. Teach it your conventions

Edit `LUMEN.md` to describe your project's rules — component library, import
aliases, folder structure, off-limits files, and so on. It is re-read on every
message, so changes take effect immediately with no restart.

### 4. Run

Start your dev server and click the sparkles badge in the corner.

## Configuration

`createLumenHandler(config)` accepts:

| Option | Default | Description |
| --- | --- | --- |
| `referenceDirs` | `[]` | Sibling repos the agent may **read** (not edit). |
| `secretPatterns` | built-in set | Extra regexes for paths the agent must never read or edit. Merged with defaults. |
| `rulesFile` | `"LUMEN.md"` | Path to the project rules file. |
| `appDir` | `"src/app"` | Where your App Router routes live. |
| `featuresDir` | `"src/features"` | Where feature modules live. |
| `allowedTools` | safe default set | Which Claude Code tools the agent may use. |
| `enabled` | dev-only check | Predicate controlling whether the agent runs. |
| `protectedBranches` | `["main", "master", "develop", "production"]` | Branches the publish flow refuses to commit to directly. |

## Safety

- **Secret guard** — a `PreToolUse` hook blocks the agent from reading or
  editing sensitive paths (`.env`, SSH keys, PEM certs, `.npmrc`, plus your
  custom `secretPatterns`).
- **Scoped edits** — the agent edits only your app; `referenceDirs` are
  read-only.
- **Production gate** — `lumen-assert-no-agent` runs after `next build` (wired
  as a `postbuild` script during install) to ensure no agent code ships to
  production. You can also invoke it directly in CI.

## Package exports

| Entry | Purpose |
| --- | --- |
| `@payglocal_ui/lumen/next` | App Router adapter — `createLumenHandler`. |
| `@payglocal_ui/lumen/client` | React overlay components and the `useAgentChat` hook. |
| `@payglocal_ui/lumen/server` | Server primitives (config, prompt assembly, handlers). |
| `@payglocal_ui/lumen/types` | Isomorphic TypeScript types. |
| `@payglocal_ui/lumen/styles.css` | Compiled overlay styles. |

## License

MIT
