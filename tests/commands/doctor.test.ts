import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers";
import { runDoctor } from "../../src/commands/doctor";
import type { Manifest } from "../../src/types";

let tempDir: string;
beforeEach(() => { tempDir = createTempDir(); });
afterEach(() => { cleanupTempDir(tempDir); });

describe("doctor command", () => {
  it("detects credential files in repo", () => {
    const repoDir = join(tempDir, "repo");
    writeFixture(repoDir, "test/auth.json", '{"secret":true}');
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: join(tempDir, "machine"), include: ["auth.json"], exclude: [] } },
    };
    const result = runDoctor({ manifest, repoDir });
    expect(result.credentialWarnings.length).toBeGreaterThan(0);
    expect(result.credentialWarnings[0]).toContain("auth.json");
  });

  it("validates manifest schema", () => {
    const repoDir = join(tempDir, "repo");
    const badManifest = { version: 1 } as any;
    const result = runDoctor({ manifest: badManifest, repoDir });
    expect(result.schemaErrors.length).toBeGreaterThan(0);
  });

  it("detects stale absolute paths in config files", () => {
    const repoDir = join(tempDir, "repo");
    const homeDir = process.env.HOME || "/home";
    writeFixture(repoDir, "test/config.json", JSON.stringify({ path: homeDir + "/some/project" }));
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: join(tempDir, "machine"), include: ["config.json"], exclude: [] } },
    };
    const result = runDoctor({ manifest, repoDir });
    expect(result.stalePathWarnings.length).toBeGreaterThan(0);
    expect(result.stalePathWarnings[0]).toContain("absolute path");
  });

  it("detects machine-only files not in repo", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(machineDir, "extra.json", "{}");
    writeFixture(repoDir, "test/settings.json", "{}");
    writeFixture(machineDir, "settings.json", "{}");
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["settings.json", "extra.json"], exclude: [] } },
    };
    const result = runDoctor({ manifest, repoDir });
    expect(result.unmanagedFiles.length).toBeGreaterThan(0);
    expect(result.unmanagedFiles[0]).toContain("extra.json");
  });
});
