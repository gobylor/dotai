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

  it("detects .p12 certificate files", () => {
    const repoDir = join(tempDir, "repo");
    writeFixture(repoDir, "test/cert.p12", "binary");
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: join(tempDir, "machine"), include: ["cert.p12"], exclude: [] } },
    };
    const result = runDoctor({ manifest, repoDir });
    expect(result.credentialWarnings.length).toBeGreaterThan(0);
    expect(result.credentialWarnings[0]).toContain(".p12");
  });

  it("detects id_rsa private key files", () => {
    const repoDir = join(tempDir, "repo");
    writeFixture(repoDir, "test/id_rsa", "private key");
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: join(tempDir, "machine"), include: ["id_rsa"], exclude: [] } },
    };
    const result = runDoctor({ manifest, repoDir });
    expect(result.credentialWarnings.length).toBeGreaterThan(0);
    expect(result.credentialWarnings[0]).toContain("id_rsa");
  });

  it("detects .netrc files", () => {
    const repoDir = join(tempDir, "repo");
    writeFixture(repoDir, "test/.netrc", "machine github.com");
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: join(tempDir, "machine"), include: [".netrc"], exclude: [] } },
    };
    const result = runDoctor({ manifest, repoDir });
    expect(result.credentialWarnings.length).toBeGreaterThan(0);
    expect(result.credentialWarnings[0]).toContain(".netrc");
  });

  it("healthy is true when only unmanaged files exist", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(machineDir, "extra.json", "{}");
    writeFixture(machineDir, "settings.json", "{}");
    writeFixture(repoDir, "test/settings.json", "{}");
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["settings.json", "extra.json"], exclude: [] } },
    };
    const result = runDoctor({ manifest, repoDir });
    expect(result.unmanagedFiles.length).toBeGreaterThan(0);
    expect(result.healthy).toBe(true);
  });

  it("detects missing files (repo-only)", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(repoDir, "test/missing-on-machine.json", '{"data":true}');
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["missing-on-machine.json"], exclude: [] } },
    };
    const result = runDoctor({ manifest, repoDir });
    expect(result.missingFiles.length).toBeGreaterThan(0);
    expect(result.missingFiles[0]).toContain("missing-on-machine.json");
  });

  it("detects *.pem credential files", () => {
    const repoDir = join(tempDir, "repo");
    writeFixture(repoDir, "test/server.pem", "-----BEGIN CERTIFICATE-----");
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: join(tempDir, "machine"), include: ["server.pem"], exclude: [] } },
    };
    const result = runDoctor({ manifest, repoDir });
    expect(result.credentialWarnings.length).toBeGreaterThan(0);
    expect(result.credentialWarnings[0]).toContain(".pem");
  });

  it("healthy is true for completely clean manifest", () => {
    const machineDir = join(tempDir, "machine");
    const repoDir = join(tempDir, "repo");
    writeFixture(machineDir, "settings.json", "{}");
    writeFixture(repoDir, "test/settings.json", "{}");
    const manifest: Manifest = {
      version: 1,
      tools: { test: { source: machineDir, include: ["settings.json"], exclude: [] } },
    };
    const result = runDoctor({ manifest, repoDir });
    expect(result.healthy).toBe(true);
    expect(result.schemaErrors).toHaveLength(0);
    expect(result.credentialWarnings).toHaveLength(0);
    expect(result.stalePathWarnings).toHaveLength(0);
    expect(result.missingFiles).toHaveLength(0);
    expect(result.unmanagedFiles).toHaveLength(0);
  });
});
