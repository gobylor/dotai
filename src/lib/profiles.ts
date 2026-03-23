import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolProfile } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// After bundling, __dirname is dist/ and profiles are at dist/profiles/.
// In development, __dirname is src/lib/ and profiles are at src/profiles/.
const PROFILES_DIR = existsSync(join(__dirname, "profiles"))
  ? join(__dirname, "profiles")
  : join(__dirname, "..", "profiles");

let _profileCache: Record<string, ToolProfile> | null = null;

export function loadBuiltinProfiles(): Record<string, ToolProfile> {
  if (_profileCache) return _profileCache;
  const profiles: Record<string, ToolProfile> = {};
  const entries = readdirSync(PROFILES_DIR).filter((f) => f.endsWith(".json"));
  for (const file of entries) {
    const content = readFileSync(join(PROFILES_DIR, file), "utf-8");
    let profile: ToolProfile;
    try {
      profile = JSON.parse(content);
    } catch {
      throw new Error(`Failed to parse profile "${file}": file contains invalid JSON`);
    }
    profiles[profile.name] = profile;
  }
  _profileCache = profiles;
  return profiles;
}

// For testing: allow cache reset
export function _resetProfileCache(): void {
  _profileCache = null;
}

export function getProfile(name: string): ToolProfile | null {
  const profiles = loadBuiltinProfiles();
  return profiles[name] ?? null;
}

export function getAllProfileNames(): string[] {
  return Object.keys(loadBuiltinProfiles());
}
