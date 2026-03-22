import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers";
import { runInit } from "../../src/commands/init";

let tempDir: string;
beforeEach(() => { tempDir = createTempDir(); });
afterEach(() => { cleanupTempDir(tempDir); });

describe("init command", () => {
  it("generates dotai.json when CLI config dirs exist", () => {
    writeFixture(join(tempDir, ".claude"), "settings.json", "{}");
    const repoDir = join(tempDir, "repo");
    runInit({ repoDir, homeDir: tempDir });
    expect(existsSync(join(repoDir, "dotai.json"))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(repoDir, "dotai.json"), "utf-8"));
    expect(manifest.version).toBe(1);
    expect(manifest.tools).toHaveProperty("claude");
  });

  it("generates .gitignore", () => {
    writeFixture(join(tempDir, ".claude"), "settings.json", "{}");
    const repoDir = join(tempDir, "repo");
    runInit({ repoDir, homeDir: tempDir });
    expect(existsSync(join(repoDir, ".gitignore"))).toBe(true);
    const gitignore = readFileSync(join(repoDir, ".gitignore"), "utf-8");
    expect(gitignore).toContain("auth.json");
  });

  it("returns warning and skips when dotai.json already exists", () => {
    const repoDir = join(tempDir, "repo");
    writeFixture(repoDir, "dotai.json", '{"version":1,"tools":{"custom":{"source":"~/.custom","include":["x"],"exclude":[]}}}');
    const result = runInit({ repoDir, homeDir: tempDir });
    expect(result.warnings[0]).toContain("already exists");
    // Verify the existing manifest was NOT overwritten
    const content = readFileSync(join(repoDir, "dotai.json"), "utf-8");
    expect(content).toContain("custom");
  });

  it("creates empty manifest when no CLIs found", () => {
    const repoDir = join(tempDir, "repo");
    const result = runInit({ repoDir, homeDir: tempDir });
    expect(result.warnings[0]).toContain("No AI CLI config directories found");
    expect(existsSync(join(repoDir, "dotai.json"))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(repoDir, "dotai.json"), "utf-8"));
    expect(Object.keys(manifest.tools)).toHaveLength(0);
  });
});
