import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseInstalledPlugins,
  parseKnownMarketplaces,
  getPluginsToRestore,
  getMarketplacesToRestore,
  restoreClaudePlugins,
} from "../../src/lib/plugins";
import * as child_process from "node:child_process";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

const mockExecFileSync = child_process.execFileSync as ReturnType<typeof vi.fn>;

const SAMPLE_INSTALLED = {
  version: 2,
  plugins: {
    "superpowers@claude-plugins-official": [
      {
        scope: "user" as const,
        installPath: "/Users/alice/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.5",
        version: "5.0.5",
        installedAt: "2026-01-27T05:56:30.584Z",
        lastUpdated: "2026-03-18T06:52:32.461Z",
        gitCommitSha: "469a6d81ebb8b827e284d4afb090c6c622d97747",
      },
    ],
    "obsidian@obsidian-skills": [
      {
        scope: "local" as const,
        projectPath: "/Users/alice/obsidian_backup/SynologyDrive/Lor-s-Personal",
        installPath: "/Users/alice/.claude/plugins/cache/obsidian-skills/obsidian/1.0.0",
        version: "1.0.0",
        installedAt: "2026-01-15T09:32:54.110Z",
        lastUpdated: "2026-01-15T09:32:54.110Z",
        gitCommitSha: "4540df83fc68a68bef27e83ae79bc4f1b4d2ea7c",
      },
    ],
    "gopls-lsp@claude-plugins-official": [
      {
        scope: "user" as const,
        installPath: "/Users/alice/.claude/plugins/cache/claude-plugins-official/gopls-lsp/1.0.0",
        version: "1.0.0",
        installedAt: "2026-01-19T17:51:46.885Z",
        lastUpdated: "2026-01-19T17:51:46.885Z",
        gitCommitSha: "96276205880a60fd66bbae981f5ab568e70c4cbf",
      },
    ],
  },
};

const SAMPLE_MARKETPLACES = {
  "claude-plugins-official": {
    source: { source: "github" as const, repo: "anthropics/claude-plugins-official" },
    installLocation: "/Users/alice/.claude/plugins/marketplaces/claude-plugins-official",
    lastUpdated: "2026-03-23T02:35:04.858Z",
  },
  "obsidian-skills": {
    source: { source: "github" as const, repo: "kepano/obsidian-skills" },
    installLocation: "/Users/alice/.claude/plugins/marketplaces/obsidian-skills",
    lastUpdated: "2026-01-15T09:28:33.764Z",
  },
  omc: {
    source: { source: "git" as const, url: "https://github.com/Yeachan-Heo/oh-my-claudecode.git" },
    installLocation: "/Users/alice/.claude/plugins/marketplaces/omc",
    lastUpdated: "2026-03-11T05:50:17.809Z",
  },
};

describe("parseInstalledPlugins", () => {
  it("returns all plugin keys", () => {
    const result = parseInstalledPlugins(JSON.stringify(SAMPLE_INSTALLED));
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.key)).toEqual([
      "superpowers@claude-plugins-official",
      "obsidian@obsidian-skills",
      "gopls-lsp@claude-plugins-official",
    ]);
  });

  it("picks most recent entry when multiple exist", () => {
    const manifest = {
      version: 2,
      plugins: {
        "test@mkt": [
          { scope: "user", installPath: "/old", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "aaa" },
          { scope: "user", installPath: "/new", version: "2.0", installedAt: "2026-03-01T00:00:00Z", lastUpdated: "2026-03-01T00:00:00Z", gitCommitSha: "bbb" },
        ],
      },
    };
    const result = parseInstalledPlugins(JSON.stringify(manifest));
    expect(result).toHaveLength(1);
    expect(result[0].version).toBe("2.0");
  });
});

describe("parseKnownMarketplaces", () => {
  it("returns all marketplaces with source info", () => {
    const result = parseKnownMarketplaces(JSON.stringify(SAMPLE_MARKETPLACES));
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.name)).toEqual(["claude-plugins-official", "obsidian-skills", "omc"]);
  });

  it("extracts github repo for github sources", () => {
    const result = parseKnownMarketplaces(JSON.stringify(SAMPLE_MARKETPLACES));
    const official = result.find((m) => m.name === "claude-plugins-official")!;
    expect(official.addArg).toBe("anthropics/claude-plugins-official");
  });

  it("extracts git url for git sources", () => {
    const result = parseKnownMarketplaces(JSON.stringify(SAMPLE_MARKETPLACES));
    const omc = result.find((m) => m.name === "omc")!;
    expect(omc.addArg).toBe("https://github.com/Yeachan-Heo/oh-my-claudecode.git");
  });
});

describe("getPluginsToRestore", () => {
  it("filters out local-scoped plugins", () => {
    const plugins = parseInstalledPlugins(JSON.stringify(SAMPLE_INSTALLED));
    const result = getPluginsToRestore(plugins, new Set());
    expect(result.toInstall.map((p) => p.key)).toEqual([
      "superpowers@claude-plugins-official",
      "gopls-lsp@claude-plugins-official",
    ]);
    expect(result.warned.map((p) => p.key)).toEqual(["obsidian@obsidian-skills"]);
  });

  it("filters out already-installed plugins", () => {
    const plugins = parseInstalledPlugins(JSON.stringify(SAMPLE_INSTALLED));
    const alreadyInstalled = new Set(["superpowers@claude-plugins-official"]);
    const result = getPluginsToRestore(plugins, alreadyInstalled);
    expect(result.toInstall.map((p) => p.key)).toEqual(["gopls-lsp@claude-plugins-official"]);
    expect(result.skipped.map((p) => p.key)).toEqual(["superpowers@claude-plugins-official"]);
  });

  it("filters out project-scoped plugins", () => {
    const manifest = {
      version: 2,
      plugins: {
        "proj-plugin@mkt": [
          { scope: "project", projectPath: "/some/project", installPath: "/x", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "aaa" },
        ],
      },
    };
    const plugins = parseInstalledPlugins(JSON.stringify(manifest));
    const result = getPluginsToRestore(plugins, new Set());
    expect(result.toInstall).toHaveLength(0);
    expect(result.warned).toHaveLength(1);
  });
});

describe("getMarketplacesToRestore", () => {
  it("filters out already-registered marketplaces", () => {
    const marketplaces = parseKnownMarketplaces(JSON.stringify(SAMPLE_MARKETPLACES));
    const alreadyRegistered = new Set(["claude-plugins-official"]);
    const result = getMarketplacesToRestore(marketplaces, alreadyRegistered);
    expect(result.toAdd.map((m) => m.name)).toEqual(["obsidian-skills", "omc"]);
    expect(result.skipped.map((m) => m.name)).toEqual(["claude-plugins-official"]);
  });
});

// Minimal JSON fixtures for restoreClaudePlugins tests
const RESTORE_INSTALLED_JSON = JSON.stringify({
  version: 2,
  plugins: {
    "superpowers@claude-plugins-official": [
      { scope: "user", installPath: "/x", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "aaa" },
    ],
    "obsidian@obsidian-skills": [
      { scope: "local", projectPath: "/some/project", installPath: "/y", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "bbb" },
    ],
  },
});

const RESTORE_MARKETPLACES_JSON = JSON.stringify({
  "claude-plugins-official": {
    source: { source: "github", repo: "anthropics/claude-plugins-official" },
    installLocation: "/x",
    lastUpdated: "2026-01-01T00:00:00Z",
  },
});

describe("restoreClaudePlugins", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it("adds marketplaces then installs plugins", () => {
    // marketplace list returns empty, plugin list returns empty
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from("")) // marketplace list
      .mockReturnValueOnce(undefined)        // marketplace add
      .mockReturnValueOnce(Buffer.from("")) // plugin list
      .mockReturnValueOnce(undefined);       // plugin install

    const result = restoreClaudePlugins({
      installedPluginsJson: RESTORE_INSTALLED_JSON,
      knownMarketplacesJson: RESTORE_MARKETPLACES_JSON,
      dryRun: false,
      verbose: false,
    });

    // marketplace add should have been called
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "claude",
      ["plugins", "marketplace", "add", "anthropics/claude-plugins-official"],
      expect.objectContaining({ stdio: "pipe" })
    );

    // plugin install should have been called for user-scoped plugin
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "claude",
      ["plugins", "install", "superpowers@claude-plugins-official", "--scope", "user"],
      expect.objectContaining({ stdio: "pipe" })
    );

    expect(result.marketplacesAdded).toEqual(["claude-plugins-official"]);
    expect(result.pluginsInstalled).toEqual(["superpowers@claude-plugins-official"]);
    expect(result.pluginsWarned).toEqual(["obsidian@obsidian-skills"]);
  });

  it("skips local-scoped plugins with warning", () => {
    const localOnlyJson = JSON.stringify({
      version: 2,
      plugins: {
        "local-plugin@mkt": [
          { scope: "local", projectPath: "/proj", installPath: "/z", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "ccc" },
        ],
      },
    });

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from("")) // marketplace list (no marketplaces in manifest so no add calls)
      .mockReturnValueOnce(Buffer.from("")); // plugin list

    const result = restoreClaudePlugins({
      installedPluginsJson: localOnlyJson,
      knownMarketplacesJson: JSON.stringify({}),
      dryRun: false,
      verbose: false,
    });

    expect(result.pluginsWarned).toEqual(["local-plugin@mkt"]);
    expect(result.pluginsInstalled).toHaveLength(0);
  });

  it("dry-run reports without executing any CLI commands", () => {
    const result = restoreClaudePlugins({
      installedPluginsJson: RESTORE_INSTALLED_JSON,
      knownMarketplacesJson: RESTORE_MARKETPLACES_JSON,
      dryRun: true,
      verbose: false,
    });

    expect(mockExecFileSync).not.toHaveBeenCalled();
    expect(result.marketplacesAdded).toEqual(["claude-plugins-official"]);
    expect(result.pluginsInstalled).toEqual(["superpowers@claude-plugins-official"]);
    expect(result.pluginsWarned).toEqual(["obsidian@obsidian-skills"]);
  });

  it("handles missing claude CLI gracefully", () => {
    const enoentError = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
    mockExecFileSync.mockImplementationOnce(() => { throw enoentError; });

    const result = restoreClaudePlugins({
      installedPluginsJson: RESTORE_INSTALLED_JSON,
      knownMarketplacesJson: RESTORE_MARKETPLACES_JSON,
      dryRun: false,
      verbose: false,
    });

    expect(result.claudeCliMissing).toBe(true);
    expect(result.pluginsInstalled).toHaveLength(0);
  });

  it("continues when individual plugin install fails", () => {
    const twoPluginsJson = JSON.stringify({
      version: 2,
      plugins: {
        "plugin-a@mkt": [
          { scope: "user", installPath: "/a", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "ddd" },
        ],
        "plugin-b@mkt": [
          { scope: "user", installPath: "/b", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "eee" },
        ],
      },
    });

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from("")) // marketplace list
      .mockReturnValueOnce(Buffer.from("")) // plugin list
      .mockImplementationOnce(() => { throw new Error("install failed"); }) // plugin-a install fails
      .mockReturnValueOnce(undefined); // plugin-b install succeeds

    const result = restoreClaudePlugins({
      installedPluginsJson: twoPluginsJson,
      knownMarketplacesJson: JSON.stringify({}),
      dryRun: false,
      verbose: false,
    });

    expect(result.pluginsFailed).toEqual(["plugin-a@mkt"]);
    expect(result.pluginsInstalled).toEqual(["plugin-b@mkt"]);
  });
});
