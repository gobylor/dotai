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
});
