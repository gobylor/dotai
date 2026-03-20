import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers";
import { runExport } from "../../src/commands/export";
import type { Manifest } from "../../src/types";

let tempDir: string;
beforeEach(() => { tempDir = createTempDir(); });
afterEach(() => { cleanupTempDir(tempDir); });

describe("export command", () => {
  it("copies machine files to repo", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(machineDir, "settings.json", '{"key":"value"}');
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["settings.json"], exclude: [] } },
    };
    runExport({ manifest, repoDir, verbose: false });
    expect(existsSync(join(repoDir, "test", "settings.json"))).toBe(true);
    expect(readFileSync(join(repoDir, "test", "settings.json"), "utf-8")).toBe('{"key":"value"}');
  });

  it("generates README.md", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(machineDir, "settings.json", "{}");
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["settings.json"], exclude: [] } },
    };
    runExport({ manifest, repoDir, verbose: false });
    expect(existsSync(join(repoDir, "README.md"))).toBe(true);
    expect(readFileSync(join(repoDir, "README.md"), "utf-8")).toContain("test");
  });

  it("respects --only flag", () => {
    const machine1 = join(tempDir, "m1");
    const machine2 = join(tempDir, "m2");
    const repoDir = join(tempDir, "repo");
    writeFixture(machine1, "a.json", "a");
    writeFixture(machine2, "b.json", "b");
    const manifest: Manifest = {
      version: 1,
      tools: {
        tool1: { source: machine1, include: ["a.json"], exclude: [] },
        tool2: { source: machine2, include: ["b.json"], exclude: [] },
      },
    };
    runExport({ manifest, repoDir, verbose: false, only: "tool1" });
    expect(existsSync(join(repoDir, "tool1", "a.json"))).toBe(true);
    expect(existsSync(join(repoDir, "tool2", "b.json"))).toBe(false);
  });
});
