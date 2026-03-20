import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { copyFile, copyDir, createBackup } from "../lib/fileops.js";
import { resolveFiles, expandHome } from "../lib/resolve.js";
import type { Manifest } from "../types.js";

interface ImportOptions {
  manifest: Manifest;
  repoDir: string;
  verbose: boolean;
  dryRun: boolean;
  sync: boolean;
  only?: string;
  backupBase: string;
}

interface ImportResult {
  filesImported: number;
  filesDeleted: number;
  backupPaths: string[];
  toolsImported: string[];
}

export function runImport(options: ImportOptions): ImportResult {
  const { manifest, repoDir, verbose, dryRun, sync, only, backupBase } = options;
  let filesImported = 0;
  let filesDeleted = 0;
  const backupPaths: string[] = [];
  const toolsImported: string[] = [];
  const toolNames = only ? [only] : Object.keys(manifest.tools);

  for (const toolName of toolNames) {
    const tool = manifest.tools[toolName];
    if (!tool) continue;
    const machineBase = expandHome(tool.source);
    const resolved = resolveFiles(manifest, repoDir, toolName);

    const hasExisting = existsSync(machineBase) && resolved.files.some(
      (f) => f.state === "modified" || f.state === "repo-only"
    );

    if (hasExisting && !dryRun) {
      const bp = createBackup(machineBase, backupBase, toolName);
      backupPaths.push(bp);
      if (verbose) console.log(`  Backup created for ${toolName}: ${bp}`);
    }

    if (!dryRun) {
      mkdirSync(machineBase, { recursive: true });
    }

    for (const file of resolved.files) {
      if (file.state === "repo-only" || file.state === "modified") {
        if (dryRun) {
          if (verbose) console.log(`  [dry-run] would copy: ${file.relativePath}`);
        } else {
          if (existsSync(file.repoPath) && statSync(file.repoPath).isDirectory()) {
            copyDir(file.repoPath, file.machinePath);
          } else {
            copyFile(file.repoPath, file.machinePath);
          }
          if (verbose) console.log(`  ${toolName}: ${file.relativePath}`);
          filesImported++;
        }
      } else if (file.state === "machine-only" && sync) {
        if (dryRun) {
          if (verbose) console.log(`  [dry-run] would delete: ${file.relativePath}`);
        } else {
          rmSync(file.machinePath, { force: true });
          if (verbose) console.log(`  ${toolName}: deleted ${file.relativePath}`);
          filesDeleted++;
        }
      }
    }
    toolsImported.push(toolName);
  }

  return { filesImported, filesDeleted, backupPaths, toolsImported };
}
