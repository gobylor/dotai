import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolProfile } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILES_DIR = join(__dirname, "..", "profiles");

export function loadBuiltinProfiles(): Record<string, ToolProfile> {
  const profiles: Record<string, ToolProfile> = {};
  const profileFiles = ["claude.json", "codex.json"];
  for (const file of profileFiles) {
    const content = readFileSync(join(PROFILES_DIR, file), "utf-8");
    const profile: ToolProfile = JSON.parse(content);
    profiles[profile.name] = profile;
  }
  return profiles;
}

export function getProfile(name: string): ToolProfile | null {
  const profiles = loadBuiltinProfiles();
  return profiles[name] ?? null;
}

export function getAllProfileNames(): string[] {
  return Object.keys(loadBuiltinProfiles());
}
