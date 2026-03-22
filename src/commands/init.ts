import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadBuiltinProfiles } from "../lib/profiles.js";
import { generateGitignore } from "../lib/gitignore.js";
import { expandHome } from "../lib/resolve.js";
import type { Manifest } from "../types.js";

interface InitOptions {
  repoDir: string;
  homeDir?: string;
}

interface InitResult {
  manifestPath: string | null;
  warnings: string[];
  toolsFound: string[];
}

export function runInit(options: InitOptions): InitResult {
  const { repoDir, homeDir } = options;
  const manifestPath = join(repoDir, "dotai.json");
  if (existsSync(manifestPath)) {
    return {
      manifestPath: null,
      warnings: ["dotai.json already exists. Delete it first if you want to re-initialize."],
      toolsFound: [],
    };
  }
  // Allow tests to override HOME
  const prevHome = process.env.HOME;
  if (homeDir) process.env.HOME = homeDir;

  const profiles = loadBuiltinProfiles();
  const warnings: string[] = [];
  const toolsFound: string[] = [];
  const manifest: Manifest = { version: 1, tools: {} };

  try {
  for (const [name, profile] of Object.entries(profiles)) {
    const configDir = expandHome(profile.configDir);
    if (existsSync(configDir)) {
      toolsFound.push(name);
      manifest.tools[name] = {
        source: profile.configDir,
        include: [...profile.portable],
        exclude: [...profile.ephemeral],
      };
    }
  }

  if (toolsFound.length === 0) {
    warnings.push("No AI CLI config directories found. Creating empty manifest — add tools manually.");
  }

  mkdirSync(repoDir, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  const profileList = toolsFound.map((name) => profiles[name]);
  const gitignore = generateGitignore(profileList);
  writeFileSync(join(repoDir, ".gitignore"), gitignore, "utf-8");

  return { manifestPath, warnings, toolsFound };
  } finally {
    if (homeDir) process.env.HOME = prevHome;
  }
}
