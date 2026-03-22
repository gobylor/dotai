import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers";
import { expandHome, resolveFiles } from "../../src/lib/resolve";
import type { Manifest } from "../../src/types";

let tempDir: string;
let repoDir: string;
let machineDir: string;

beforeEach(() => {
  tempDir = createTempDir();
  repoDir = join(tempDir, "repo");
  machineDir = join(tempDir, "machine");
});
afterEach(() => { cleanupTempDir(tempDir); });

function makeManifest(tool: string, source: string, include: string[]): Manifest {
  return { version: 1, tools: { [tool]: { source, include, exclude: [] } } };
}

describe("expandHome", () => {
  it("throws when HOME is undefined and path starts with ~", () => {
    const origHome = process.env.HOME;
    delete process.env.HOME;
    try {
      expect(() => expandHome("~/.claude")).toThrow("HOME environment variable is not set");
    } finally {
      process.env.HOME = origHome;
    }
  });

  it("returns non-tilde paths unchanged even without HOME", () => {
    const origHome = process.env.HOME;
    delete process.env.HOME;
    try {
      expect(expandHome("/absolute/path")).toBe("/absolute/path");
    } finally {
      process.env.HOME = origHome;
    }
  });
});

describe("resolveFiles", () => {
  it("detects in-sync files", () => {
    writeFixture(repoDir, "test/settings.json", '{"a":1}');
    writeFixture(machineDir, "settings.json", '{"a":1}');
    const manifest = makeManifest("test", machineDir, ["settings.json"]);
    const result = resolveFiles(manifest, repoDir, "test");
    expect(result.files[0].state).toBe("in-sync");
  });

  it("detects modified files", () => {
    writeFixture(repoDir, "test/settings.json", '{"a":1}');
    writeFixture(machineDir, "settings.json", '{"a":2}');
    const manifest = makeManifest("test", machineDir, ["settings.json"]);
    const result = resolveFiles(manifest, repoDir, "test");
    expect(result.files[0].state).toBe("modified");
  });

  it("detects repo-only files", () => {
    writeFixture(repoDir, "test/settings.json", '{"a":1}');
    const manifest = makeManifest("test", machineDir, ["settings.json"]);
    const result = resolveFiles(manifest, repoDir, "test");
    expect(result.files[0].state).toBe("repo-only");
  });

  it("detects machine-only files", () => {
    writeFixture(machineDir, "settings.json", '{"a":1}');
    const manifest = makeManifest("test", machineDir, ["settings.json"]);
    const result = resolveFiles(manifest, repoDir, "test");
    expect(result.files[0].state).toBe("machine-only");
  });

  it("resolves directory includes recursively", () => {
    writeFixture(machineDir, "commands/a.md", "a");
    writeFixture(machineDir, "commands/b.md", "b");
    const manifest = makeManifest("test", machineDir, ["commands/"]);
    const result = resolveFiles(manifest, repoDir, "test");
    expect(result.files.length).toBe(2);
    expect(result.files.every((f) => f.state === "machine-only")).toBe(true);
  });

  it("filters out excluded paths", () => {
    writeFixture(machineDir, "settings.json", "{}");
    writeFixture(machineDir, "cache/data.bin", "cached");
    writeFixture(machineDir, "history.jsonl", "log");
    const manifest: Manifest = {
      version: 1,
      tools: {
        test: {
          source: machineDir,
          include: ["settings.json", "cache/", "history.jsonl"],
          exclude: ["cache/", "history.jsonl"],
        },
      },
    };
    const result = resolveFiles(manifest, repoDir, "test");
    expect(result.files.length).toBe(1);
    expect(result.files[0].relativePath).toBe("settings.json");
  });

  it("filters glob exclude patterns like *.sqlite", () => {
    writeFixture(machineDir, "config.toml", "data");
    writeFixture(machineDir, "state.sqlite", "binary");
    const manifest: Manifest = {
      version: 1,
      tools: {
        test: {
          source: machineDir,
          include: ["config.toml", "state.sqlite"],
          exclude: ["*.sqlite"],
        },
      },
    };
    const result = resolveFiles(manifest, repoDir, "test");
    expect(result.files.length).toBe(1);
    expect(result.files[0].relativePath).toBe("config.toml");
  });
});
