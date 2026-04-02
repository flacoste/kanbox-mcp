import { describe, it, expect, vi, beforeEach } from "vitest";

// The CLI will export a `run` function for testability.
// Top-level code in cli.ts calls run(process.argv.slice(2)) only when
// executed directly, not when imported.
import { run } from "../src/cli.js";

// Capture process.exit, stdout, stderr
function mockProcess() {
  const output = { stdout: "", stderr: "", exitCode: undefined as number | undefined };

  const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number | string | null | undefined) => {
    output.exitCode = typeof code === "number" ? code : 0;
    throw new Error(`process.exit(${code})`);
  });

  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    output.stdout += String(chunk);
    return true;
  });

  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    output.stderr += String(chunk);
    return true;
  });

  // Also capture console.error which writes to stderr
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    output.stderr += args.map(String).join(" ") + "\n";
  });

  return {
    output,
    cleanup() {
      exitSpy.mockRestore();
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    },
  };
}

async function runCli(
  args: string[],
  env: Partial<{ KANBOX_API_TOKEN: string; KANBOX_BASE_URL: string }> = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { output, cleanup } = mockProcess();

  // Temporarily set env vars
  const origToken = process.env.KANBOX_API_TOKEN;
  const origBaseUrl = process.env.KANBOX_BASE_URL;

  if ("KANBOX_API_TOKEN" in env) {
    if (env.KANBOX_API_TOKEN === undefined) {
      delete process.env.KANBOX_API_TOKEN;
    } else {
      process.env.KANBOX_API_TOKEN = env.KANBOX_API_TOKEN;
    }
  }
  if (env.KANBOX_BASE_URL) {
    process.env.KANBOX_BASE_URL = env.KANBOX_BASE_URL;
  }

  try {
    await run(args);
    if (output.exitCode === undefined) output.exitCode = 0;
  } catch {
    // process.exit throws — exitCode already captured
    if (output.exitCode === undefined) output.exitCode = 1;
  } finally {
    cleanup();
    // Restore env
    if (origToken !== undefined) process.env.KANBOX_API_TOKEN = origToken;
    else delete process.env.KANBOX_API_TOKEN;
    if (origBaseUrl !== undefined) process.env.KANBOX_BASE_URL = origBaseUrl;
    else delete process.env.KANBOX_BASE_URL;
  }

  return { stdout: output.stdout, stderr: output.stderr, exitCode: output.exitCode };
}

describe("CLI scaffold", () => {
  describe("--help", () => {
    it("prints usage to stderr and exits 0", async () => {
      const result = await runCli(["--help"], { KANBOX_API_TOKEN: "test-token" });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("Usage:");
    });

    it("works without KANBOX_API_TOKEN set", async () => {
      const result = await runCli(["--help"], { KANBOX_API_TOKEN: undefined });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("Usage:");
    });
  });

  describe("command-specific help", () => {
    it("prints command help when command followed by --help", async () => {
      const result = await runCli(["search-members", "--help"], {
        KANBOX_API_TOKEN: "test-token",
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("search-members");
    });
  });

  describe("missing token", () => {
    it("prints error to stderr and exits 1 when running a command", async () => {
      const result = await runCli(["search-members", "--q", "test"], {
        KANBOX_API_TOKEN: undefined,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("KANBOX_API_TOKEN");
    });
  });

  describe("unknown command", () => {
    it("prints error to stderr and exits 1", async () => {
      const result = await runCli(["nonexistent"], {
        KANBOX_API_TOKEN: "test-token",
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Unknown command");
    });
  });

  describe("no arguments", () => {
    it("prints usage to stderr", async () => {
      const result = await runCli([], { KANBOX_API_TOKEN: "test-token" });
      expect(result.stderr).toContain("Usage:");
    });
  });
});
