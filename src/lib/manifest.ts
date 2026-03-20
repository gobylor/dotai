import { readFileSync } from "node:fs";
import type { Manifest } from "../types.js";

export function parseManifest(jsonString: string): Manifest {
  return JSON.parse(jsonString) as Manifest;
}

export function readManifest(filePath: string): Manifest {
  const content = readFileSync(filePath, "utf-8");
  return parseManifest(content);
}

export function validateManifest(data: any): string[] {
  const errors: string[] = [];
  if (typeof data.version !== "number") {
    errors.push("Missing or invalid 'version' field (must be a number)");
  }
  if (!data.tools || typeof data.tools !== "object") {
    errors.push("Missing or invalid 'tools' field (must be an object)");
    return errors;
  }
  for (const [name, tool] of Object.entries(data.tools)) {
    const t = tool as any;
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

export function isKnownConfigDir(source: string): boolean {
  return KNOWN_CONFIG_DIRS.some((dir) => source === dir || source.startsWith(dir + "/"));
}
