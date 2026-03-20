import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";

export function copyFile(src: string, dst: string): void {
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
}

export function copyDir(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  _copyDirRecursive(src, dst);
}

function _copyDirRecursive(src: string, dst: string): void {
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" && entry.isDirectory()) continue;
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(dstPath, { recursive: true });
      _copyDirRecursive(srcPath, dstPath);
    } else if (entry.isSymbolicLink()) {
      // Preserve symlinks — copy the link itself, not the target
      try {
        const target = readlinkSync(srcPath);
        symlinkSync(target, dstPath);
      } catch {
        // Skip broken or unsupported symlinks
      }
    } else if (entry.isFile()) {
      try {
        copyFileSync(srcPath, dstPath);
      } catch {
        // Skip files that can't be copied (sockets, special files)
      }
    }
  }
}

export function createBackup(sourceDir: string, backupBase: string, label: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupDir = join(backupBase, `backup-${timestamp}`, label);
  mkdirSync(backupDir, { recursive: true });
  // Use cpSync for faithful backup — preserves .git, unlike copyDir which strips it
  cpSync(sourceDir, backupDir, { recursive: true });
  return backupDir;
}

export function filesAreEqual(pathA: string, pathB: string): boolean {
  try {
    const a = readFileSync(pathA);
    const b = readFileSync(pathB);
    return a.equals(b);
  } catch {
    return false; // If either file can't be read, treat as different
  }
}

export function deleteFile(filePath: string): void {
  rmSync(filePath, { force: true });
}
