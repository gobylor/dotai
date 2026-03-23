import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  it("accepts skipPlugins option without error", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(repoDir, "test/settings.json", '{"imported":true}');
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["settings.json"], exclude: [] } },
    };
    const result = runImport({
      manifest, repoDir, verbose: false, dryRun: false, sync: false,
      backupBase: join(tempDir, "backups"), skipPlugins: true,
    });
    expect(result.filesImported).toBe(1);
    expect(result.pluginRestore).toBeUndefined();
  });

  it("dry-run returns pluginRestore without executing CLI commands", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(machineDir, "plugins/installed_plugins.json", JSON.stringify({
      version: 2,
      plugins: {
        "test-plugin@test-mkt": [
          { scope: "user", installPath: "/x", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "aaa" },
        ],
      },
    }));
    writeFixture(machineDir, "plugins/known_marketplaces.json", JSON.stringify({
      "test-mkt": {
        source: { source: "github", repo: "test/test-marketplace" },
        installLocation: "/x",
        lastUpdated: "2026-01-01T00:00:00Z",
      },
    }));
    writeFixture(repoDir, "claude/plugins/installed_plugins.json", JSON.stringify({
      version: 2,
      plugins: {
        "test-plugin@test-mkt": [
          { scope: "user", installPath: "/x", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "aaa" },
        ],
      },
    }));
    writeFixture(repoDir, "claude/plugins/known_marketplaces.json", JSON.stringify({
      "test-mkt": {
        source: { source: "github", repo: "test/test-marketplace" },
        installLocation: "/x",
        lastUpdated: "2026-01-01T00:00:00Z",
      },
    }));

    const manifest: Manifest = {
      version: 1,
      tools: {
        claude: {
          source: machineDir,
          include: ["plugins/installed_plugins.json", "plugins/known_marketplaces.json"],
          exclude: [],
        },
      },
    };
    const result = runImport({
      manifest, repoDir, verbose: false, dryRun: true, sync: false,
      backupBase: join(tempDir, "backups"),
    });
    expect(result.pluginRestore).toBeDefined();
    expect(result.pluginRestore!.pluginsInstalled).toContain("test-plugin@test-mkt");
  });

  it("logs warning when plugin manifest is corrupt (not ENOENT)", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    // Write corrupt binary data to the plugin manifest file
    writeFixture(machineDir, "plugins/installed_plugins.json", "\x00\x01\x02 corrupt binary");
    writeFixture(machineDir, "plugins/known_marketplaces.json", "{}");
    writeFixture(repoDir, "claude/plugins/installed_plugins.json", "\x00\x01\x02 corrupt binary");
    writeFixture(repoDir, "claude/plugins/known_marketplaces.json", "{}");

    const manifest: Manifest = {
      version: 1,
      tools: {
        claude: {
          source: machineDir,
          include: ["plugins/installed_plugins.json", "plugins/known_marketplaces.json"],
          exclude: [],
        },
      },
    };

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = runImport({
        manifest, repoDir, verbose: false, dryRun: true, sync: false,
        backupBase: join(tempDir, "backups"),
      });
      // Plugin restore should have failed due to corrupt JSON, warning should be logged
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Plugin restore failed"));
      expect(result.pluginRestore).toBeUndefined();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("skipPlugins prevents plugin restore", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(repoDir, "test/settings.json", '{"imported":true}');
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["settings.json"], exclude: [] } },
    };
    const result = runImport({
      manifest, repoDir, verbose: false, dryRun: false, sync: false,
      backupBase: join(tempDir, "backups"), skipPlugins: true,
    });
    expect(result.pluginRestore).toBeUndefined();
  });
});
