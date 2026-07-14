---
name: Orval-generated Zod types vs Drizzle column types
description: How OpenAPI date/number fields end up typed after Orval codegen, and what that means when writing to a Drizzle-backed Postgres table.
---

When an OpenAPI schema field has `format: date` (or date-time), Orval's Zod codegen emits `zod.coerce.date()`, so the parsed request body has a real JS `Date` object, not a string.

**Why:** Drizzle `date` columns configured with `{ mode: "string" }` (the common choice, since Postgres `date` has no timezone) expect a `YYYY-MM-DD` string on insert/update. Passing a `Date` object fails TypeScript compilation (not just a runtime issue).

**How to apply:** In Express route handlers that insert/update rows from a Zod-parsed body, explicitly convert any `Date` fields back to `date.toISOString().slice(0, 10)` before passing to Drizzle `.values()`/`.set()`.

A related mismatch: Postgres `numeric` columns come back from `drizzle` as strings by default. If the OpenAPI response schema types that field as `number`, either cast in SQL (e.g. `sql<number>`${col}::float8`\`\`) or convert in JS before validating/returning — otherwise the generated Zod response schema throws a runtime `ZodError` (`expected number, received string`) even though TypeScript compiled fine.
