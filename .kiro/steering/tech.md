---
inclusion: always
---

# Tech stack and conventions

Chosen for speed, low latency and reliability; the comparison with Rust, Go, Python and Bun is in `.kiro/specs/gamedna-mvp/design.md` section 1. Measured MCP latency is in `docs/BENCHMARKS.md`.

- TypeScript 5.9 (strict, `noUncheckedIndexedAccess`), Node.js 22 LTS, npm workspaces. `.npmrc` sets `legacy-peer-deps=true`.
- Phaser 3.90.0, Vite 7.3.8, React 19 (workbench only), Zod 4 at every trust boundary, MCP TypeScript SDK 1.32.2 over stdio, Playwright 1.65.1 Chromium, Vitest 4 and fast-check 4.
- Pin exact versions. Record every new dependency in `docs/DEPENDENCY_INVENTORY.md` with its license.
- Game rules go in deterministic fixed-step simulation classes. No `Math.random()` or wall-clock time in rules; use the seeded `rng`.
- MCP server: stdout is protocol only; log to stderr. No generic shell tool. Only `package.json` scripts named in `.gamedna/project.json` may run. All paths go through `resolveInside`.
- Errors use the typed codes in `packages/core/src/errors.ts`. A tool failure is never reported as a passing check.
- Commands: `npm test`, `npm run typecheck`, `npm run build`, `npm run bench:mcp`.
