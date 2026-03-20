import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { filesAreEqual } from "./fileops.js";
import type { Manifest, ResolvedTool, ResolvedFile, FileState } from "../types.js";

export function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    return join(process.env.HOME || "", p.slice(2));
  }
  return p;
}

export function resolveFiles(
  manifest: Manifest,
  repoDir: string,
  toolName: string
): ResolvedTool {
  const tool = manifest.tools[toolName];
  if (!tool) {
    return { name: toolName, files: [] };
  }

  const machineBase = expandHome(tool.source);
  const repoBase = join(repoDir, toolName);
  const excludePatterns = tool.exclude || [];
  const allPaths = new Set<string>();

  for (const inc of tool.include) {
    const machinePath = join(machineBase, inc);
    if (existsSync(machinePath)) {
      if (statSync(machinePath).isDirectory()) {
        walkDir(machinePath, machineBase, allPaths);
      } else {
        allPaths.add(inc);
      }
    }
  }

  if (existsSync(repoBase)) {
    walkDir(repoBase, repoBase, allPaths);
  }

  // Filter out excluded paths
  for (const relPath of allPaths) {
    if (isExcluded(relPath, excludePatterns)) {
      allPaths.delete(relPath);
    }
  }

  const files: ResolvedFile[] = [];
  for (const relPath of Array.from(allPaths).sort()) {
    const repoPath = join(repoBase, relPath);
    const machinePath = join(machineBase, relPath);
    const inRepo = existsSync(repoPath);
    const onMachine = existsSync(machinePath);

    let state: FileState;
    if (inRepo && onMachine) {
      // Only compare regular files, not directories
      const repoIsFile = statSync(repoPath).isFile();
      const machineIsFile = statSync(machinePath).isFile();
      if (repoIsFile && machineIsFile) {
        state = filesAreEqual(repoPath, machinePath) ? "in-sync" : "modified";
      } else {
        state = "in-sync"; // directories that exist in both are considered in-sync
      }
    } else if (inRepo) {
      state = "repo-only";
    } else {
      state = "machine-only";
    }

    files.push({ relativePath: relPath, repoPath, machinePath, state });
  }

  return { name: toolName, files };
}

function walkDir(dir: string, base: string, out: Set<string>): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" && entry.isDirectory()) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, base, out);
    } else {
      out.add(relative(base, fullPath));
    }
  }
}

function isExcluded(relPath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.endsWith("/") && (relPath.startsWith(pattern) || relPath.startsWith(pattern.slice(0, -1)))) {
      return true;
    }
    if (pattern.startsWith("*") && relPath.endsWith(pattern.slice(1))) {
      return true;
    }
    if (relPath === pattern) {
      return true;
    }
    if (relPath.startsWith(pattern)) {
      return true;
    }
  }
  return false;
}
