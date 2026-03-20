import { describe, it, expect } from "vitest";
import { parseRepoArg, validateExternalManifest } from "../../src/commands/use";

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
