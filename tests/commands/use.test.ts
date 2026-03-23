import { describe, it, expect, vi, afterEach } from "vitest";
import { parseRepoArg, runUse, validateExternalManifest } from "../../src/commands/use";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

vi.mock("node:child_process", async (importOriginal) => {
  const mod = await importOriginal<typeof import("node:child_process")>();
  return { ...mod, execFileSync: vi.fn(mod.execFileSync) };
});

const mockedExecFileSync = vi.mocked(execFileSync);

describe("use command", () => {
  it("parses user/repo format", () => {
    const result = parseRepoArg("rl.yang/dotai-config");
    expect(result.owner).toBe("rl.yang");
    expect(result.repo).toBe("dotai-config");
    expect(result.url).toBe("https://github.com/rl.yang/dotai-config.git");
  });

  it("parses full GitHub URL", () => {
    const result = parseRepoArg("https://github.com/foo/bar");
    expect(result.owner).toBe("foo");
    expect(result.repo).toBe("bar");
  });

  it("rejects manifest with non-standard source paths", () => {
    const manifest = {
      version: 1,
      tools: { evil: { source: "~/Documents/secrets", include: [], exclude: [] } },
    };
    const errors = validateExternalManifest(manifest as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("source");
  });

  it("accepts manifest with known config dirs", () => {
    const manifest = {
      version: 1,
      tools: { claude: { source: "~/.claude", include: ["settings.json"], exclude: [] } },
    };
    const errors = validateExternalManifest(manifest as any);
    expect(errors).toHaveLength(0);
  });
});

describe("runUse with mocked git", () => {
  afterEach(() => {
    mockedExecFileSync.mockRestore();
  });

  it("throws friendly error when clone fails (repo not found)", () => {
    const backupBase = createTempDir();
    const cloneError = Object.assign(new Error("clone failed"), {
      status: 128,
      stderr: Buffer.from("fatal: repository 'https://github.com/nonexistent-user-zzz/nonexistent-repo-zzz.git' not found"),
    });
    mockedExecFileSync.mockImplementation(() => { throw cloneError; });
    try {
      expect(() =>
        runUse({
          repoArg: "nonexistent-user-zzz/nonexistent-repo-zzz",
          dryRun: false,
          verbose: false,
          backupBase,
        })
      ).toThrow(/not found/i);
    } finally {
      cleanupTempDir(backupBase);
    }
  });

  it("runUse success flow: clone -> validate -> import (dry-run)", () => {
    const backupBase = createTempDir();

    // When git clone is called, create a fake repo in the target dir
    mockedExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args?.[0] === "clone") {
        const targetDir = args[args.length - 1] as string;
        writeFixture(targetDir, "dotai.json", JSON.stringify({
          version: 1,
          tools: { claude: { source: "~/.claude", include: ["settings.json"], exclude: [] } },
        }));
        writeFixture(join(targetDir, "claude"), "settings.json", '{"theme":"dark"}');
        return Buffer.from("");
      }
      return Buffer.from("");
    });

    try {
      const result = runUse({
        repoArg: "test/dotai-config",
        dryRun: true,
        verbose: false,
        backupBase,
        skipPlugins: true,
      });
      expect(result).toBeDefined();
    } finally {
      cleanupTempDir(backupBase);
    }
  });

  it("runUse with --skip-plugins does not attempt plugin restore", () => {
    const backupBase = createTempDir();

    mockedExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args?.[0] === "clone") {
        const targetDir = args[args.length - 1] as string;
        writeFixture(targetDir, "dotai.json", JSON.stringify({
          version: 1,
          tools: { claude: { source: "~/.claude", include: ["settings.json"], exclude: [] } },
        }));
        writeFixture(join(targetDir, "claude"), "settings.json", '{"theme":"dark"}');
        return Buffer.from("");
      }
      return Buffer.from("");
    });

    try {
      const result = runUse({
        repoArg: "test/dotai-config",
        dryRun: true,
        verbose: false,
        backupBase,
        skipPlugins: true,
      });
      expect(result.pluginRestore).toBeUndefined();
    } finally {
      cleanupTempDir(backupBase);
    }
  });

  it("throws friendly error for invalid repo format", () => {
    expect(() => parseRepoArg("just-one-word")).toThrow("Invalid repo format");
  });
});

// Real network test -- only runs when DOTAI_NETWORK_TESTS=1
describe.skipIf(process.env.DOTAI_NETWORK_TESTS !== "1")("runUse network tests", () => {
  it("throws friendly error when repo does not exist (network)", { timeout: 15_000 }, () => {
    const backupBase = createTempDir();
    try {
      expect(() =>
        runUse({
          repoArg: "nonexistent-user-zzz/nonexistent-repo-zzz",
          dryRun: false,
          verbose: false,
          backupBase,
        })
      ).toThrow(/not found|does not exist|failed to clone|No dotai\.json found/i);
    } finally {
      cleanupTempDir(backupBase);
    }
  });
});

describe("parseRepoArg input validation (SEC-03)", () => {
  it("rejects --flag/repo format", () => {
    expect(() => parseRepoArg("--flag/repo")).toThrow("Owner and repo must contain only");
  });

  it("rejects owner with shell metacharacters", () => {
    expect(() => parseRepoArg("user;rm/repo")).toThrow("Owner and repo must contain only");
  });

  it("rejects repo with backticks", () => {
    expect(() => parseRepoArg("user/repo`cmd`")).toThrow("Owner and repo must contain only");
  });

  it("accepts valid owner.name/repo-name", () => {
    const result = parseRepoArg("rl.yang/dotai-config");
    expect(result.owner).toBe("rl.yang");
    expect(result.repo).toBe("dotai-config");
  });
});

describe("validateExternalManifest (SEC-07)", () => {
  it("does not re-validate base schema", () => {
    // Pass a valid manifest with an unknown source dir
    const manifest = {
      version: 1,
      tools: { evil: { source: "~/Documents/secrets", include: [], exclude: [] } },
    };
    const errors = validateExternalManifest(manifest as any);
    // Should only contain isKnownConfigDir error, not base schema errors
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("not a known AI CLI config directory");
  });

  it("returns empty for valid external manifest", () => {
    const manifest = {
      version: 1,
      tools: { claude: { source: "~/.claude", include: ["settings.json"], exclude: [] } },
    };
    const errors = validateExternalManifest(manifest as any);
    expect(errors).toHaveLength(0);
  });
});
