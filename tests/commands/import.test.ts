import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers";
import { runImport } from "../../src/commands/import";
import type { Manifest } from "../../src/types";

let tempDir: string;
beforeEach(() => { tempDir = createTempDir(); });
afterEach(() => { cleanupTempDir(tempDir); });

describe("import command", () => {
  it("copies repo files to machine", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(repoDir, "test/settings.json", '{"imported":true}');
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["settings.json"], exclude: [] } },
    };
    runImport({ manifest, repoDir, verbose: false, dryRun: false, sync: false, backupBase: join(tempDir, "backups") });
    expect(readFileSync(join(machineDir, "settings.json"), "utf-8")).toBe('{"imported":true}');
  });

  it("creates backup before overwriting", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    const backupBase = join(tempDir, "backups");
    writeFixture(machineDir, "settings.json", '{"old":true}');
    writeFixture(repoDir, "test/settings.json", '{"new":true}');
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["settings.json"], exclude: [] } },
    };
    const result = runImport({ manifest, repoDir, verbose: false, dryRun: false, sync: false, backupBase });
    expect(result.backupPaths.length).toBeGreaterThan(0);
    expect(readFileSync(join(machineDir, "settings.json"), "utf-8")).toBe('{"new":true}');
  });

  it("dry-run does not write files", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(repoDir, "test/settings.json", '{"new":true}');
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["settings.json"], exclude: [] } },
    };
    runImport({ manifest, repoDir, verbose: false, dryRun: true, sync: false, backupBase: join(tempDir, "backups") });
    expect(existsSync(join(machineDir, "settings.json"))).toBe(false);
  });

  it("--sync deletes machine-only files", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(machineDir, "settings.json", "{}");
    writeFixture(machineDir, "extra.json", "{}");
    writeFixture(repoDir, "test/settings.json", "{}");
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["settings.json", "extra.json"], exclude: [] } },
    };
    runImport({ manifest, repoDir, verbose: false, dryRun: false, sync: true, backupBase: join(tempDir, "backups") });
    expect(existsSync(join(machineDir, "settings.json"))).toBe(true);
    expect(existsSync(join(machineDir, "extra.json"))).toBe(false);
  });
});
