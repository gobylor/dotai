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
});
