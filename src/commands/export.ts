import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { copyFile, copyDir } from "../lib/fileops.js";
import { resolveFiles } from "../lib/resolve.js";
import { generateReadme } from "../lib/readme.js";
import type { Manifest } from "../types.js";

interface ExportOptions {
  manifest: Manifest;
  repoDir: string;
  verbose: boolean;
  only?: string;
}

interface ExportResult {
  filesCopied: number;
  toolsExported: string[];
}

export function runExport(options: ExportOptions): ExportResult {
  const { manifest, repoDir, verbose, only } = options;
  let filesCopied = 0;
  const toolsExported: string[] = [];
  const toolNames = only ? [only] : Object.keys(manifest.tools);

  for (const toolName of toolNames) {
    const tool = manifest.tools[toolName];
    if (!tool) continue;

    const resolved = resolveFiles(manifest, repoDir, toolName);

    let toolFilesCopied = 0;
    for (const file of resolved.files) {
      // Export machine-only and modified files to repo
      if (file.state === "machine-only" || file.state === "modified") {
        try {
          if (statSync(file.machinePath).isDirectory()) {
            copyDir(file.machinePath, file.repoPath);
          } else {
            copyFile(file.machinePath, file.repoPath);
          }
          if (verbose) console.log(`  ${toolName}: ${file.relativePath}`);
          toolFilesCopied++;
          filesCopied++;
        } catch {
          console.warn(`  Warning: ${toolName}/${file.relativePath} skipped (copy error)`);
        }
      }
    }
    if (toolFilesCopied > 0) {
      toolsExported.push(toolName);
    }
  }

  if (filesCopied > 0) {
    writeFileSync(join(repoDir, "README.md"), generateReadme(manifest), "utf-8");
  }
  return { filesCopied, toolsExported };
}
