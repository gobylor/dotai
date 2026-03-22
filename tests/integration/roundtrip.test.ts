import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers";
import { runInit } from "../../src/commands/init";
import { runExport } from "../../src/commands/export";
import { runImport } from "../../src/commands/import";
import { readManifest } from "../../src/lib/manifest";

let tempDir: string;
let homeDir: string;
let repoDir: string;
let origHome: string | undefined;

beforeEach(() => {
  tempDir = createTempDir();
  homeDir = tempDir;
  repoDir = join(tempDir, "config-repo");
  origHome = process.env.HOME;
});
afterEach(() => {
  process.env.HOME = origHome;
  cleanupTempDir(tempDir);
});

describe("round-trip: init → export → import", () => {
  it("preserves file content through full cycle", () => {
    // Setup: create fake Claude config on "machine A"
    const claudeDir = join(homeDir, ".claude");
    writeFixture(claudeDir, "settings.json", '{"theme":"dark","model":"opus"}');
    writeFixture(claudeDir, "commands/refactor.md", "# Refactor\nClean up code");
    writeFixture(claudeDir, "CLAUDE.md", "# Project Instructions\nBe helpful.");

    // Step 1: Init — auto-discover and generate manifest
    const initResult = runInit({ repoDir, homeDir });
    expect(initResult.toolsFound).toContain("claude");
    expect(existsSync(join(repoDir, "dotai.json"))).toBe(true);

    // Step 2: Export — copy machine configs to repo
    // Set HOME so expandHome("~/.claude") resolves to machine A's config
    process.env.HOME = homeDir;
    const manifest = readManifest(join(repoDir, "dotai.json"));
    const exportResult = runExport({ manifest, repoDir, verbose: false });
    expect(exportResult.filesCopied).toBeGreaterThan(0);

    // Verify exported files exist in repo
    expect(existsSync(join(repoDir, "claude", "settings.json"))).toBe(true);
    expect(readFileSync(join(repoDir, "claude", "settings.json"), "utf-8")).toBe(
      '{"theme":"dark","model":"opus"}'
    );

    // Step 3: Simulate "machine B" — different HOME with no config
    const machineBHome = join(tempDir, "machine-b");
    const machineBClaude = join(machineBHome, ".claude");

    // Modify manifest to point to machine B's config dir
    const manifestForB = {
      ...manifest,
      tools: {
        ...manifest.tools,
        claude: { ...manifest.tools.claude, source: machineBClaude },
      },
    };

    // Step 4: Import — copy repo configs to machine B
    const backupBase = join(tempDir, "backups");
    const importResult = runImport({
      manifest: manifestForB,
      repoDir,
      verbose: false,
      dryRun: false,
      sync: false,
      backupBase,
    });
    expect(importResult.filesImported).toBeGreaterThan(0);

    // Step 5: Verify machine B has identical files
    expect(readFileSync(join(machineBClaude, "settings.json"), "utf-8")).toBe(
      '{"theme":"dark","model":"opus"}'
    );
    expect(readFileSync(join(machineBClaude, "commands/refactor.md"), "utf-8")).toBe(
      "# Refactor\nClean up code"
    );
    expect(readFileSync(join(machineBClaude, "CLAUDE.md"), "utf-8")).toBe(
      "# Project Instructions\nBe helpful."
    );
  });

  it("detects modified files after local edit", () => {
    // Setup: create fake Claude config and export it
    const claudeDir = join(homeDir, ".claude");
    writeFixture(claudeDir, "settings.json", '{"theme":"dark"}');

    runInit({ repoDir, homeDir });
    // Set HOME so expandHome("~/.claude") resolves correctly
    process.env.HOME = homeDir;
    const manifest = readManifest(join(repoDir, "dotai.json"));
    runExport({ manifest, repoDir, verbose: false });

    // Verify in-sync after export
    expect(readFileSync(join(repoDir, "claude", "settings.json"), "utf-8")).toBe('{"theme":"dark"}');

    // Simulate local edit on machine
    writeFixture(claudeDir, "settings.json", '{"theme":"light"}');

    // Re-export should pick up the change
    const result2 = runExport({ manifest, repoDir, verbose: false });
    expect(result2.filesCopied).toBeGreaterThan(0);
    expect(readFileSync(join(repoDir, "claude", "settings.json"), "utf-8")).toBe('{"theme":"light"}');
  });
});
