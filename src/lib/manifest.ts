import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Manifest } from "../types.js";

export function parseManifest(jsonString: string): Manifest {
  const data = JSON.parse(jsonString) as Manifest;
  const errors = validateManifest(data);
  if (errors.length > 0) {
    throw new Error(`Invalid manifest:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  return data;
}

export function readManifest(filePath: string): Manifest {
  const content = readFileSync(filePath, "utf-8");
  return parseManifest(content); // parseManifest now validates internally
}

export function validateManifest(data: Record<string, unknown> | Manifest): string[] {
  const errors: string[] = [];
  if (typeof data.version !== "number") {
    errors.push("Missing or invalid 'version' field (must be a number)");
  }
  if (!data.tools || typeof data.tools !== "object") {
    errors.push("Missing or invalid 'tools' field (must be an object)");
    return errors;
  }
  for (const [name, tool] of Object.entries(data.tools as Record<string, unknown>)) {
    const t = tool as Record<string, unknown>;
    if (!t.source || typeof t.source !== "string") {
      errors.push(`Tool '${name}': missing 'source' field`);
    }
    if (!Array.isArray(t.include)) {
      errors.push(`Tool '${name}': missing 'include' array`);
    }
    if (!Array.isArray(t.exclude)) {
      errors.push(`Tool '${name}': missing 'exclude' array`);
    }
  }
  return errors;
}

const KNOWN_CONFIG_DIRS = ["~/.claude", "~/.codex", "~/.cursor", "~/.windsurf", "~/.aider"];

export function getKnownConfigDirs(): string[] {
  return [...KNOWN_CONFIG_DIRS];
}

export function isKnownConfigDir(source: string): boolean {
  // Normalize: expand ~ and resolve ../ sequences for ALL paths (tilde and absolute)
  const home = process.env.HOME || "/nonexistent";
  const normalize = (p: string) => {
    const expanded = p.startsWith("~/") ? resolve(home, p.slice(2)) : resolve(p);
    return expanded;
  };

  const resolved = normalize(source);
  return KNOWN_CONFIG_DIRS.some((dir) => {
    const resolvedDir = normalize(dir);
    return resolved === resolvedDir || resolved.startsWith(resolvedDir + "/");
  });
}
