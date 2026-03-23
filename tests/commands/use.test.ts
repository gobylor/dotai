import { describe, it, expect } from "vitest";
import { parseRepoArg, runUse, validateExternalManifest } from "../../src/commands/use";
import { createTempDir, cleanupTempDir } from "../helpers";

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

describe("runUse error handling", () => {
  it("throws friendly error when repo does not exist", () => {
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

  it("throws friendly error for invalid repo format", () => {
    expect(() => parseRepoArg("just-one-word")).toThrow("Invalid repo format");
  });
});
