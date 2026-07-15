/**
 * Tests for safe-push.mjs
 *
 * The script calls process.exit() directly, so we test it by spawning it as a
 * child process and inspecting the exit code + output.
 *
 * "No TTY" is achieved by running with stdio: 'pipe' – the child process never
 * has stdin attached to a terminal, so process.stdin.isTTY is undefined/false.
 *
 * For the FORCE=1 path we prepend a fake `drizzle-kit` shim to PATH so the
 * real drizzle-kit (which needs a live database) is never invoked.
 */

import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const SCRIPT = resolve(import.meta.dirname, "safe-push.mjs");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Absolute path to the directory that contains this test file. */
const SCRIPTS_DIR = resolve(import.meta.dirname);

/**
 * Creates a temporary directory containing a fake `drizzle-kit` shim.
 * The shim writes its received arguments to stdout and exits 0.
 */
function createFakeDrizzleKitDir() {
  const dir = mkdtempSync(join(tmpdir(), "safe-push-test-"));
  const shim = join(dir, "drizzle-kit");
  // Shell shim: echo all args to stdout, exit 0
  writeFileSync(
    shim,
    "#!/bin/sh\necho \"drizzle-kit called with: $*\"\nexit 0\n"
  );
  chmodSync(shim, 0o755);
  return dir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("safe-push.mjs – no TTY, no FORCE", () => {
  it("exits with code 1", () => {
    const result = spawnSync("node", [SCRIPT], {
      stdio: "pipe",
      env: { ...process.env, FORCE: undefined },
    });

    expect(result.status).toBe(1);
  });

  it("prints the abort message to stderr", () => {
    const result = spawnSync("node", [SCRIPT], {
      stdio: "pipe",
      env: { ...process.env, FORCE: undefined },
    });

    const stderr = result.stderr.toString();
    expect(stderr).toMatch(/Schema push aborted/i);
  });

  it("does not invoke drizzle-kit", () => {
    // Use a fake drizzle-kit that would write to stdout if called
    const fakeDir = createFakeDrizzleKitDir();
    try {
      const result = spawnSync("node", [SCRIPT], {
        stdio: "pipe",
        env: {
          ...process.env,
          FORCE: undefined,
          PATH: `${fakeDir}:${process.env.PATH}`,
        },
      });

      const stdout = result.stdout.toString();
      expect(stdout).not.toMatch(/drizzle-kit called/);
    } finally {
      rmSync(fakeDir, { recursive: true, force: true });
    }
  });
});

describe("safe-push.mjs – no TTY, FORCE=1", () => {
  let fakeDir;

  beforeAll(() => {
    fakeDir = createFakeDrizzleKitDir();
  });

  afterAll(() => {
    rmSync(fakeDir, { recursive: true, force: true });
  });

  function runWithForce() {
    return spawnSync("node", [SCRIPT], {
      stdio: "pipe",
      env: {
        ...process.env,
        FORCE: "1",
        PATH: `${fakeDir}:${process.env.PATH}`,
      },
    });
  }

  it("exits with code 0 (drizzle-kit shim succeeds)", () => {
    const result = runWithForce();
    expect(result.status).toBe(0);
  });

  it("invokes drizzle-kit", () => {
    const result = runWithForce();
    const stdout = result.stdout.toString();
    expect(stdout).toMatch(/drizzle-kit called/i);
  });

  it("passes --force to drizzle-kit", () => {
    const result = runWithForce();
    const stdout = result.stdout.toString();
    expect(stdout).toMatch(/--force/);
  });

  it("prints the FORCE warning to stderr", () => {
    const result = runWithForce();
    const stderr = result.stderr.toString();
    expect(stderr).toMatch(/FORCE=1 detected/i);
  });
});
