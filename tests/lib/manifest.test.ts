import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers";
import { parseManifest, readManifest, validateManifest, isKnownConfigDir } from "../../src/lib/manifest";

const VALID_MANIFEST = {
  version: 1,
  tools: {
    claude: {
      source: "~/.claude",
      include: ["settings.json", "commands/"],
      exclude: ["sessions/", "cache/"],
    },
  },
};

let tempDir: string;
beforeEach(() => { tempDir = createTempDir(); });
afterEach(() => { cleanupTempDir(tempDir); });

describe("manifest", () => {
  it("parses valid JSON string", () => {
    const result = parseManifest(JSON.stringify(VALID_MANIFEST));
    expect(result.version).toBe(1);
    expect(result.tools.claude.source).toBe("~/.claude");
  });
  it("throws on invalid JSON", () => {
    expect(() => parseManifest("not json")).toThrow();
  });
  it("parseManifest throws on invalid manifest", () => {
    expect(() => parseManifest('{"version":"bad"}')).toThrow("Invalid manifest");
  });
  it("readManifest throws on invalid file", () => {
    const filePath = join(tempDir, "bad.json");
    writeFixture(tempDir, "bad.json", '{"version":"bad"}');
    expect(() => readManifest(filePath)).toThrow("Invalid manifest");
  });
  it("readManifest returns valid manifest from file", () => {
    const filePath = join(tempDir, "good.json");
    writeFixture(tempDir, "good.json", JSON.stringify(VALID_MANIFEST));
    const result = readManifest(filePath);
    expect(result.version).toBe(1);
    expect(result.tools.claude.source).toBe("~/.claude");
  });
  it("validates a correct manifest", () => {
    const errors = validateManifest(VALID_MANIFEST);
    expect(errors).toHaveLength(0);
  });
  it("rejects manifest without version", () => {
    const errors = validateManifest({ tools: {} } as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("version");
  });
  it("rejects manifest without tools", () => {
    const errors = validateManifest({ version: 1 } as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("tools");
  });
  it("rejects tool without source", () => {
    const bad = { version: 1, tools: { x: { include: [], exclude: [] } } };
    const errors = validateManifest(bad as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("source");
  });
  it("readManifest throws ENOENT for missing file", () => {
    const missingPath = join(tempDir, "nonexistent.json");
    expect(() => readManifest(missingPath)).toThrow();
  });
  it("readManifest throws on invalid JSON in file", () => {
    const filePath = join(tempDir, "broken.json");
    writeFixture(tempDir, "broken.json", "{ not valid json }}}");
    expect(() => readManifest(filePath)).toThrow();
  });
});

describe("isKnownConfigDir", () => {
  it("accepts exact known dirs", () => {
    expect(isKnownConfigDir("~/.claude")).toBe(true);
    expect(isKnownConfigDir("~/.codex")).toBe(true);
  });

  it("accepts subdirs of known dirs", () => {
    expect(isKnownConfigDir("~/.claude/settings")).toBe(true);
  });

  it("rejects unknown dirs", () => {
    expect(isKnownConfigDir("~/Documents/secrets")).toBe(false);
  });

  it("rejects path traversal via ../", () => {
    expect(isKnownConfigDir("~/.claude/../../etc")).toBe(false);
  });

  it("rejects path traversal with deeper nesting", () => {
    expect(isKnownConfigDir("~/.claude/skills/../../../etc/passwd")).toBe(false);
  });

  it("rejects similar-prefix dirs like ~/.claude-evil", () => {
    expect(isKnownConfigDir("~/.claude-evil")).toBe(false);
  });

  it("rejects absolute path traversal bypassing tilde expansion", () => {
    const home = process.env.HOME || "/Users/test";
    // Absolute path that starts with known dir but contains ../ to escape
    expect(isKnownConfigDir(`${home}/.claude/../.ssh`)).toBe(false);
    expect(isKnownConfigDir(`${home}/.claude/skills/../../../etc`)).toBe(false);
  });
});
