import { describe, it, expect, vi, beforeEach } from "vitest";
import { run } from "../src/cli.js";
import { KanboxClient } from "../src/lib/kanbox-client.js";

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

// --- Unit 3: Command implementation tests ---

// Helper to mock KanboxClient.get for command tests
function mockClientGet(responses: Array<{ status: number; data: unknown }>) {
  let callIndex = 0;
  const spy = vi.fn().mockImplementation(() => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return Promise.resolve(response);
  });
  vi.spyOn(KanboxClient.prototype, "get").mockImplementation(spy);
  return spy;
}

const ENV = { KANBOX_API_TOKEN: "test-token" };

describe("CLI commands", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("search-members", () => {
    it("outputs normalized member JSON array", async () => {
      const getSpy = mockClientGet([
        {
          status: 200,
          data: {
            items: [
              {
                id: 1,
                lead: {
                  linkedin_public_id: "jane",
                  firstname: "Jane",
                  lastname: "Doe",
                  headline: "PM",
                  company: "Acme",
                  company_headcount: null,
                  company_linkedin_url: null,
                  company_website: null,
                  connections: null,
                  skills: [],
                  languages: [],
                },
                labels: [],
                conversations_ids: [],
                is_connection: true,
                is_lead: false,
              },
            ],
            count: 1,
          },
        },
      ]);

      const result = await runCli(["search-members", "--q", "jane"], ENV);
      expect(result.exitCode).toBe(0);

      const data = JSON.parse(result.stdout);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);
      expect(data[0].linkedin_public_id).toBe("jane");
      expect(data[0]).not.toHaveProperty("lead");
    });

    it("passes --limit to paginator", async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        id: i,
        lead: {
          linkedin_public_id: `user${i}`,
          firstname: "A",
          lastname: "B",
          headline: "",
          company: null,
          company_headcount: null,
          company_linkedin_url: null,
          company_website: null,
          connections: null,
          skills: [],
          languages: [],
        },
        labels: [],
        conversations_ids: [],
        is_connection: true,
        is_lead: false,
      }));
      mockClientGet([{ status: 200, data: { items, count: 10 } }]);

      const result = await runCli(["search-members", "--q", "test", "--limit", "5"], ENV);
      expect(result.exitCode).toBe(0);

      const data = JSON.parse(result.stdout);
      expect(data).toHaveLength(5);
    });

    it("splits --linkedin-public-ids on comma", async () => {
      const getSpy = mockClientGet([
        { status: 200, data: { items: [], count: 0 } },
      ]);

      await runCli(
        ["search-members", "--linkedin-public-ids", "abc,def,ghi"],
        ENV,
      );

      expect(getSpy).toHaveBeenCalledWith(
        "/public/members",
        expect.objectContaining({
          linkedin_public_ids: ["abc", "def", "ghi"],
        }),
      );
    });

    it("passes pipeline-name and step-title filters", async () => {
      const getSpy = mockClientGet([
        { status: 200, data: { items: [], count: 0 } },
      ]);

      await runCli(
        ["search-members", "--pipeline-name", "Sales", "--step-title", "Contacted"],
        ENV,
      );

      expect(getSpy).toHaveBeenCalledWith(
        "/public/members",
        expect.objectContaining({
          pipeline_name: "Sales",
          step_title: "Contacted",
        }),
      );
    });

    it("passes updated-since filter", async () => {
      const getSpy = mockClientGet([
        { status: 200, data: { items: [], count: 0 } },
      ]);

      await runCli(
        ["search-members", "--updated-since", "2026-01-01T00:00:00Z"],
        ENV,
      );

      expect(getSpy).toHaveBeenCalledWith(
        "/public/members",
        expect.objectContaining({
          updated_since: "2026-01-01T00:00:00Z",
        }),
      );
    });
  });

  describe("get-messages", () => {
    it("outputs wrapped conversation object with metadata", async () => {
      mockClientGet([
        {
          status: 200,
          data: {
            messages: [
              { id: 1, text: "Hello", created_at: "2026-01-01", is_from_me: true },
            ],
            has_more: false,
            next_cursor: null,
            participant_name: "Jane Doe",
            participant_id: "janedoe",
          },
        },
      ]);

      const result = await runCli(["get-messages", "6925049"], ENV);
      expect(result.exitCode).toBe(0);

      const data = JSON.parse(result.stdout);
      expect(data.conversation_id).toBe("6925049");
      expect(data.participant_name).toBe("Jane Doe");
      expect(data.participant_linkedin_id).toBe("janedoe");
      expect(Array.isArray(data.messages)).toBe(true);
      expect(data.messages).toHaveLength(1);
    });

    it("exits 1 with error for non-numeric conversation ID", async () => {
      const result = await runCli(["get-messages", "abc"], ENV);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/conversation.id.*number/i);
    });

    it("exits 1 with error when no conversation ID provided", async () => {
      const result = await runCli(["get-messages"], ENV);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/conversation.id/i);
    });
  });

  describe("search-leads", () => {
    it("outputs normalized lead JSON array", async () => {
      mockClientGet([
        {
          status: 200,
          data: {
            items: [
              {
                id: 10,
                linkedin_public_id: "lead1",
                firstname: "John",
                lastname: "Smith",
                headline: "Dev",
                company: null,
                lnuser: { id: 99 },
              },
            ],
            count: 1,
          },
        },
      ]);

      const result = await runCli(["search-leads", "--q", "john", "--name", "My List"], ENV);
      expect(result.exitCode).toBe(0);

      const data = JSON.parse(result.stdout);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);
      expect(data[0].linkedin_public_id).toBe("lead1");
      expect(data[0]).not.toHaveProperty("lnuser");
    });
  });

  describe("list-lists", () => {
    it("outputs normalized list JSON array", async () => {
      mockClientGet([
        {
          status: 200,
          data: {
            items: [{ id: 1, name: "My List", count: 42 }],
            count: 1,
          },
        },
      ]);

      const result = await runCli(["list-lists"], ENV);
      expect(result.exitCode).toBe(0);

      const data = JSON.parse(result.stdout);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("My List");
    });
  });

  describe("error handling", () => {
    it("prints API error to stderr and exits 1", async () => {
      vi.spyOn(KanboxClient.prototype, "get").mockRejectedValue(
        Object.assign(new Error("Unauthorized"), {
          name: "KanboxApiError",
          status: 401,
          body: "Unauthorized",
        }),
      );

      const result = await runCli(["search-members", "--q", "test"], ENV);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("401");
      expect(result.stdout).toBe("");
    });

    it("produces no stdout on mid-pagination error", async () => {
      let callCount = 0;
      vi.spyOn(KanboxClient.prototype, "get").mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            status: 200,
            data: {
              items: Array.from({ length: 100 }, (_, i) => ({
                id: i,
                lead: { linkedin_public_id: `u${i}`, firstname: "A", lastname: "B", headline: "", company: null, company_headcount: null, company_linkedin_url: null, company_website: null, connections: null, skills: [], languages: [] },
                labels: [], conversations_ids: [], is_connection: true, is_lead: false,
              })),
              count: 200,
            },
          });
        }
        return Promise.reject(new Error("Server error"));
      });

      const result = await runCli(["search-members", "--q", "test"], ENV);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
    });
  });
});
