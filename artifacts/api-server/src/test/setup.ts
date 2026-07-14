/**
 * Global test setup: runs inside every fork process.
 * Ends the pg pool so node exits cleanly after each test file.
 */
import { afterAll } from "vitest";
import { pool } from "@workspace/db";

afterAll(async () => {
  await pool.end();
});
