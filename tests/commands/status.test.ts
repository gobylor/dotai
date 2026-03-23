import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers";
import { runStatus } from "../../src/commands/status";
import type { Manifest } from "../../src/types";

let tempDir: string;
beforeEach(() => { tempDir = createTempDir(); });
afterEach(() => { cleanupTempDir(tempDir); });

describe("status command", () => {
  it("returns counts per state per tool", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(machineDir, "a.json", "{}");
    writeFixture(repoDir, "test/a.json", "{}");
    writeFixture(machineDir, "b.json", "{}");
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["a.json", "b.json"], exclude: [] } },
    };
    const result = runStatus({ manifest, repoDir });
    expect(result.tools[0].counts["in-sync"]).toBe(1);
    expect(result.tools[0].counts["machine-only"]).toBe(1);
  });

  it("reports allInSync when everything matches", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(machineDir, "a.json", '{"x":1}');
    writeFixture(repoDir, "test/a.json", '{"x":1}');
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["a.json"], exclude: [] } },
    };
    const result = runStatus({ manifest, repoDir });
    expect(result.allInSync).toBe(true);
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
    const result = runStatus({ manifest, repoDir, only: "tool1" });
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe("tool1");
  });

  it("handles multiple tools with mixed states", () => {
    const machine1 = join(tempDir, "m1");
    const machine2 = join(tempDir, "m2");
    const repoDir = join(tempDir, "repo");
    writeFixture(machine1, "a.json", '{"x":1}');
    writeFixture(repoDir, "tool1/a.json", '{"x":1}');
    writeFixture(machine2, "b.json", '{"y":1}');
    writeFixture(repoDir, "tool2/b.json", '{"y":2}');
    const manifest: Manifest = {
      version: 1,
      tools: {
        tool1: { source: machine1, include: ["a.json"], exclude: [] },
        tool2: { source: machine2, include: ["b.json"], exclude: [] },
      },
    };
    const result = runStatus({ manifest, repoDir });
    expect(result.tools).toHaveLength(2);
    expect(result.allInSync).toBe(false);
    const tool1 = result.tools.find((t) => t.name === "tool1")!;
    const tool2 = result.tools.find((t) => t.name === "tool2")!;
    expect(tool1.counts["in-sync"]).toBe(1);
    expect(tool2.counts.modified).toBe(1);
  });
});
