import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseInstalledPlugins,
  parseKnownMarketplaces,
  getPluginsToRestore,
  getMarketplacesToRestore,
  restoreClaudePlugins,
  isSafeMarketplaceUrl,
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

  it("records marketplace add failure in marketplacesFailed", () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from(""))  // marketplace list
      .mockImplementationOnce(() => { throw new Error("marketplace add failed"); }) // marketplace add fails
      .mockReturnValueOnce(Buffer.from("")); // plugin list

    const result = restoreClaudePlugins({
      installedPluginsJson: RESTORE_INSTALLED_JSON,
      knownMarketplacesJson: RESTORE_MARKETPLACES_JSON,
      dryRun: false,
      verbose: false,
    });

    expect(result.marketplacesFailed).toEqual(["claude-plugins-official"]);
    expect(result.marketplacesAdded).toEqual([]);
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

  it("rejects unsafe plugin keys in pluginsFailed", () => {
    const unsafeJson = JSON.stringify({
      version: 2,
      plugins: {
        "plugin@mkt; rm -rf /": [
          { scope: "user", installPath: "/x", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "aaa" },
        ],
      },
    });

    mockExecFileSync
      .mockReturnValueOnce(Buffer.from("")) // marketplace list
      .mockReturnValueOnce(Buffer.from("")); // plugin list

    const result = restoreClaudePlugins({
      installedPluginsJson: unsafeJson,
      knownMarketplacesJson: JSON.stringify({}),
      dryRun: false,
      verbose: false,
    });

    expect(result.pluginsFailed).toEqual(["plugin@mkt; rm -rf /"]);
    expect(result.pluginsInstalled).toHaveLength(0);
  });

  it("throws when too many plugins (SEC-09)", () => {
    const plugins: Record<string, unknown[]> = {};
    for (let i = 0; i < 51; i++) {
      plugins[`plugin-${i}@mkt`] = [
        { scope: "user", installPath: `/x${i}`, version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "aaa" },
      ];
    }
    const json = JSON.stringify({ version: 2, plugins });

    expect(() => restoreClaudePlugins({
      installedPluginsJson: json,
      knownMarketplacesJson: JSON.stringify({}),
      dryRun: true,
      verbose: false,
    })).toThrow("Too many plugins (51). Maximum is 50.");
  });

  it("throws when too many marketplaces (SEC-09)", () => {
    const mkts: Record<string, unknown> = {};
    for (let i = 0; i < 21; i++) {
      mkts[`mkt-${i}`] = {
        source: { source: "github", repo: `org/repo-${i}` },
        installLocation: `/x${i}`,
        lastUpdated: "2026-01-01T00:00:00Z",
      };
    }

    expect(() => restoreClaudePlugins({
      installedPluginsJson: JSON.stringify({ version: 2, plugins: {} }),
      knownMarketplacesJson: JSON.stringify(mkts),
      dryRun: true,
      verbose: false,
    })).toThrow("Too many marketplaces (21). Maximum is 20.");
  });
});

describe("marketplace URL validation (SEC-02, TEST-02)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects http:// URLs (requires https)", () => {
    expect(isSafeMarketplaceUrl("http://github.com/org/repo")).toBe(false);
  });

  it("rejects internal IP URLs like http://169.254.169.254/", () => {
    expect(isSafeMarketplaceUrl("http://169.254.169.254/")).toBe(false);
    expect(isSafeMarketplaceUrl("https://169.254.169.254/")).toBe(false);
  });

  it("rejects localhost URLs", () => {
    expect(isSafeMarketplaceUrl("https://localhost/repo")).toBe(false);
    expect(isSafeMarketplaceUrl("http://localhost/repo")).toBe(false);
  });

  it("accepts https://github.com/org/repo", () => {
    expect(isSafeMarketplaceUrl("https://github.com/org/repo")).toBe(true);
  });

  it("accepts https://gitlab.com/org/repo", () => {
    expect(isSafeMarketplaceUrl("https://gitlab.com/org/repo")).toBe(true);
  });

  it("accepts https://bitbucket.org/org/repo", () => {
    expect(isSafeMarketplaceUrl("https://bitbucket.org/org/repo")).toBe(true);
  });

  it("accepts custom domain when DOTAI_ALLOWED_DOMAINS is set", () => {
    vi.stubEnv("DOTAI_ALLOWED_DOMAINS", "git.corp.example.com");
    expect(isSafeMarketplaceUrl("https://git.corp.example.com/org/repo")).toBe(true);
  });

  it("rejects custom domain over HTTP even when in DOTAI_ALLOWED_DOMAINS", () => {
    vi.stubEnv("DOTAI_ALLOWED_DOMAINS", "git.corp.example.com");
    expect(isSafeMarketplaceUrl("http://git.corp.example.com/org/repo")).toBe(false);
  });

  it("rejects non-URL strings", () => {
    expect(isSafeMarketplaceUrl("not-a-url")).toBe(false);
  });
});

describe("SAFE_PLUGIN_KEY rejection (TEST-02)", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  function restoreWithPlugin(key: string) {
    const json = JSON.stringify({
      version: 2,
      plugins: {
        [key]: [
          { scope: "user", installPath: "/x", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "aaa" },
        ],
      },
    });
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from("")) // marketplace list
      .mockReturnValueOnce(Buffer.from("")); // plugin list
    return restoreClaudePlugins({
      installedPluginsJson: json,
      knownMarketplacesJson: JSON.stringify({}),
      dryRun: false,
      verbose: false,
    });
  }

  it("rejects key with shell metacharacters: 'plugin@mkt; rm -rf /'", () => {
    const result = restoreWithPlugin("plugin@mkt; rm -rf /");
    expect(result.pluginsFailed).toContain("plugin@mkt; rm -rf /");
  });

  it("rejects key starting with dash: '-evil-flag@mkt'", () => {
    const result = restoreWithPlugin("-evil-flag@mkt");
    expect(result.pluginsFailed).toContain("-evil-flag@mkt");
  });

  it("rejects key with spaces: 'plugin @mkt'", () => {
    const result = restoreWithPlugin("plugin @mkt");
    expect(result.pluginsFailed).toContain("plugin @mkt");
  });

  it("rejects key with backticks: 'plugin`cmd`@mkt'", () => {
    const result = restoreWithPlugin("plugin`cmd`@mkt");
    expect(result.pluginsFailed).toContain("plugin`cmd`@mkt");
  });

  it("rejects key without @: 'pluginonly'", () => {
    const result = restoreWithPlugin("pluginonly");
    expect(result.pluginsFailed).toContain("pluginonly");
  });

  it("accepts valid key: 'superpowers@claude-plugins-official'", () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from("")) // marketplace list
      .mockReturnValueOnce(Buffer.from("")) // plugin list
      .mockReturnValueOnce(undefined); // plugin install
    const json = JSON.stringify({
      version: 2,
      plugins: {
        "superpowers@claude-plugins-official": [
          { scope: "user", installPath: "/x", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "aaa" },
        ],
      },
    });
    const result = restoreClaudePlugins({
      installedPluginsJson: json,
      knownMarketplacesJson: JSON.stringify({}),
      dryRun: false,
      verbose: false,
    });
    expect(result.pluginsInstalled).toContain("superpowers@claude-plugins-official");
  });
});

describe("SAFE_MARKETPLACE_ARG rejection (TEST-02)", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  function restoreWithMarketplace(addArg: string) {
    const mkts = JSON.stringify({
      "test-mkt": {
        source: { source: "git", url: addArg },
        installLocation: "/x",
        lastUpdated: "2026-01-01T00:00:00Z",
      },
    });
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from("")) // marketplace list
      .mockReturnValueOnce(Buffer.from("")); // plugin list
    return restoreClaudePlugins({
      installedPluginsJson: JSON.stringify({ version: 2, plugins: {} }),
      knownMarketplacesJson: mkts,
      dryRun: false,
      verbose: false,
    });
  }

  it("rejects arg with semicolon: 'org/repo; echo pwned'", () => {
    const result = restoreWithMarketplace("org/repo; echo pwned");
    expect(result.marketplacesFailed).toContain("test-mkt");
  });

  it("rejects arg starting with dash: '--malicious'", () => {
    const result = restoreWithMarketplace("--malicious");
    expect(result.marketplacesFailed).toContain("test-mkt");
  });

  it("rejects arg with backticks", () => {
    const result = restoreWithMarketplace("org/repo`cmd`");
    expect(result.marketplacesFailed).toContain("test-mkt");
  });

  it("accepts valid github repo: 'anthropics/claude-plugins-official'", () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from("")) // marketplace list
      .mockReturnValueOnce(undefined) // marketplace add
      .mockReturnValueOnce(Buffer.from("")); // plugin list
    const mkts = JSON.stringify({
      "test-mkt": {
        source: { source: "github", repo: "anthropics/claude-plugins-official" },
        installLocation: "/x",
        lastUpdated: "2026-01-01T00:00:00Z",
      },
    });
    const result = restoreClaudePlugins({
      installedPluginsJson: JSON.stringify({ version: 2, plugins: {} }),
      knownMarketplacesJson: mkts,
      dryRun: false,
      verbose: false,
    });
    expect(result.marketplacesAdded).toContain("test-mkt");
  });

  it("accepts valid HTTPS URL: 'https://github.com/org/repo.git'", () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from("")) // marketplace list
      .mockReturnValueOnce(undefined) // marketplace add
      .mockReturnValueOnce(Buffer.from("")); // plugin list
    const mkts = JSON.stringify({
      "test-mkt": {
        source: { source: "git", url: "https://github.com/org/repo.git" },
        installLocation: "/x",
        lastUpdated: "2026-01-01T00:00:00Z",
      },
    });
    const result = restoreClaudePlugins({
      installedPluginsJson: JSON.stringify({ version: 2, plugins: {} }),
      knownMarketplacesJson: mkts,
      dryRun: false,
      verbose: false,
    });
    expect(result.marketplacesAdded).toContain("test-mkt");
  });
});
