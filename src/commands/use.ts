import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { readManifest, isKnownConfigDir, getKnownConfigDirs } from "../lib/manifest.js";
import { runImport } from "./import.js";
import type { Manifest } from "../types.js";

interface RepoRef {
  owner: string;
  repo: string;
  url: string;
}

export function parseRepoArg(arg: string): RepoRef {
  const urlMatch = arg.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      url: `https://github.com/${urlMatch[1]}/${urlMatch[2]}.git`,
    };
  }
  const parts = arg.split("/");
  const SAFE_REPO_PART = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
  if (parts.length === 2) {
    if (!SAFE_REPO_PART.test(parts[0]) || !SAFE_REPO_PART.test(parts[1])) {
      throw new Error(`Invalid repo format: ${arg}. Owner and repo must contain only alphanumeric characters, dots, hyphens, and underscores.`);
    }
    return {
      owner: parts[0],
      repo: parts[1],
      url: `https://github.com/${parts[0]}/${parts[1]}.git`,
    };
  }
  throw new Error(`Invalid repo format: ${arg}. Use owner/repo or a GitHub URL.`);
}

export function validateExternalManifest(manifest: Manifest): string[] {
  // NOTE: Base schema validation is already performed by readManifest -> parseManifest.
  // This function only checks constraints specific to external (untrusted) manifests.
  const errors: string[] = [];
  for (const [name, tool] of Object.entries(manifest.tools || {})) {
    if (!isKnownConfigDir(tool.source)) {
      errors.push(
        `Tool '${name}': source '${tool.source}' is not a known AI CLI config directory. ` +
        `Expected one of: ${getKnownConfigDirs().join(", ")}`
      );
    }
  }
  return errors;
}

interface UseResult {
  pluginRestore?: import("../lib/plugins.js").PluginRestoreResult;
}

export function runUse(options: {
  repoArg: string;
  dryRun: boolean;
  verbose: boolean;
  backupBase: string;
  skipPlugins?: boolean;
}): UseResult {
  const { repoArg, dryRun, verbose, backupBase } = options;
  const ref = parseRepoArg(repoArg);
  const tempDir = join(tmpdir(), `dotai-use-${randomBytes(6).toString("hex")}`);

  try {
    console.log(`Cloning ${ref.owner}/${ref.repo}...`);
    try {
      execFileSync("git", ["clone", "--depth", "1", ref.url, tempDir], {
        stdio: verbose ? "inherit" : "pipe",
      });
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException & { stderr?: Buffer; status?: number };
      if (e.code === "ENOENT") {
        throw new Error("git is not installed. Install git and try again.");
      }
      const stderr = e.stderr?.toString() || "";
      if (stderr.includes("not found") || stderr.includes("does not exist") || e.status === 128) {
        throw new Error(
          `Repository not found: ${ref.owner}/${ref.repo}. ` +
          `Check the URL and ensure you have access.`
        );
      }
      throw new Error(`Failed to clone ${ref.owner}/${ref.repo}: ${stderr || (err instanceof Error ? err.message : "unknown error")}`);
    }

    const manifestPath = join(tempDir, "dotai.json");
    if (!existsSync(manifestPath)) {
      throw new Error(`No dotai.json found in ${ref.owner}/${ref.repo}`);
    }

    const manifest = readManifest(manifestPath);
    const errors = validateExternalManifest(manifest);
    if (errors.length > 0) {
      throw new Error(`Invalid manifest:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    }

    const importResult = runImport({ manifest, repoDir: tempDir, verbose, dryRun, sync: false, backupBase, skipPlugins: options.skipPlugins });
    return { pluginRestore: importResult.pluginRestore };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
