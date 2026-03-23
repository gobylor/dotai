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

export function loadBuiltinProfiles(): Record<string, ToolProfile> {
  const profiles: Record<string, ToolProfile> = {};
  const entries = readdirSync(PROFILES_DIR).filter((f) => f.endsWith(".json"));
  for (const file of entries) {
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
