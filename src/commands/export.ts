import { existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { copyFile, copyDir } from "../lib/fileops.js";
import { expandHome } from "../lib/resolve.js";
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
    const machineBase = expandHome(tool.source);
    const repoBase = join(repoDir, toolName);

    for (const inc of tool.include) {
      const machinePath = join(machineBase, inc);
      const repoPath = join(repoBase, inc);
      if (!existsSync(machinePath)) {
        if (verbose) console.log(`  ⚠ ${toolName}: ${inc} not found, skipping`);
        continue;
      }
      if (statSync(machinePath).isDirectory()) {
        copyDir(machinePath, repoPath);
        if (verbose) console.log(`  ${toolName}: ${inc} (directory)`);
      } else {
        copyFile(machinePath, repoPath);
        if (verbose) console.log(`  ${toolName}: ${inc}`);
      }
      filesCopied++;
    }
    toolsExported.push(toolName);
  }

  writeFileSync(join(repoDir, "README.md"), generateReadme(manifest), "utf-8");
  return { filesCopied, toolsExported };
}
