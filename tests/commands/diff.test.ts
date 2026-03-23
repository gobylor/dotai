import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers";
import { runDiff } from "../../src/commands/diff";
import type { Manifest } from "../../src/types";

let tempDir: string;
beforeEach(() => { tempDir = createTempDir(); });
afterEach(() => { cleanupTempDir(tempDir); });

describe("diff command", () => {
  it("returns files grouped by state", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(machineDir, "same.json", "{}");
    writeFixture(repoDir, "test/same.json", "{}");
    writeFixture(machineDir, "changed.json", '{"v":1}');
    writeFixture(repoDir, "test/changed.json", '{"v":2}');
    writeFixture(machineDir, "local.json", "{}");
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["same.json", "changed.json", "local.json"], exclude: [] } },
    };
    const result = runDiff({ manifest, repoDir });
    const states = result.tools[0].files.map((f) => f.state);
    expect(states).toContain("in-sync");
    expect(states).toContain("modified");
    expect(states).toContain("machine-only");
  });

  it("respects --only flag", () => {
    const machine1 = join(tempDir, "m1");
    const machine2 = join(tempDir, "m2");
    const repoDir = join(tempDir, "repo");
    writeFixture(machine1, "a.json", "{}");
    writeFixture(machine2, "b.json", "{}");
    const manifest: Manifest = {
      version: 1,
      tools: {
        tool1: { source: machine1, include: ["a.json"], exclude: [] },
        tool2: { source: machine2, include: ["b.json"], exclude: [] },
      },
    };
    const result = runDiff({ manifest, repoDir, only: "tool1" });
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe("tool1");
  });

  it("includes repo-only files", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(repoDir, "test/only-in-repo.json", '{"repo":true}');
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["only-in-repo.json"], exclude: [] } },
    };
    const result = runDiff({ manifest, repoDir });
    const states = result.tools[0].files.map((f) => f.state);
    expect(states).toContain("repo-only");
  });

  it("returns empty tools list for empty manifest", () => {
    const repoDir = join(tempDir, "repo");
    const manifest: Manifest = { version: 1, tools: {} };
    const result = runDiff({ manifest, repoDir });
    expect(result.tools).toHaveLength(0);
  });

  it("handles multiple tools", () => {
    const machine1 = join(tempDir, "m1");
    const machine2 = join(tempDir, "m2");
    const repoDir = join(tempDir, "repo");
    writeFixture(machine1, "a.json", "{}");
    writeFixture(machine2, "b.json", "{}");
    const manifest: Manifest = {
      version: 1,
      tools: {
        tool1: { source: machine1, include: ["a.json"], exclude: [] },
        tool2: { source: machine2, include: ["b.json"], exclude: [] },
      },
    };
    const result = runDiff({ manifest, repoDir });
    expect(result.tools).toHaveLength(2);
    expect(result.tools.map((t) => t.name)).toContain("tool1");
    expect(result.tools.map((t) => t.name)).toContain("tool2");
  });
});
