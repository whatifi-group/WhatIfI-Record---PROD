---
name: Vite asset imports and uppercase file extensions
description: TypeScript module declarations for Vite asset imports are case-sensitive; uploaded files with uppercase extensions (e.g. .PNG) fail type-checking.
---

Vite's bundled `client.d.ts` declares asset modules with lowercase glob patterns only (`declare module '*.png'`, `'*.svg'`, etc.). User-uploaded files sometimes keep an uppercase extension (e.g. `Logo.PNG` from a Windows/macOS export).

**Why:** TS module declaration globs are exact-match on the extension text, so `import logo from "@assets/Logo.PNG"` fails `tsc --noEmit` with "Cannot find module" even though Vite itself would bundle it fine at runtime.

**How to apply:** Don't rename the user's original asset file. Instead add a small `vite-env.d.ts` in the app's `src/` with a matching-case declaration, e.g. `declare module "*.PNG" { const src: string; export default src; }`.
