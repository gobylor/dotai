import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateManifest } from "../lib/manifest.js";
import { resolveFiles } from "../lib/resolve.js";
import type { Manifest } from "../types.js";

interface DoctorResult {
  schemaErrors: string[];
  credentialWarnings: string[];
  stalePathWarnings: string[];
  unmanagedFiles: string[];
  missingFiles: string[];
  healthy: boolean;
}

const CREDENTIAL_PATTERNS = ["auth.json", ".env", "credentials.json", "*.key", "*.pem", "token.json"];

export function runDoctor(options: { manifest: Manifest; repoDir: string }): DoctorResult {
  const { manifest, repoDir } = options;
  const schemaErrors = validateManifest(manifest);
  const credentialWarnings: string[] = [];
  for (const [toolName] of Object.entries(manifest.tools || {})) {
    const toolRepoDir = join(repoDir, toolName);
    if (existsSync(toolRepoDir)) {
      scanForCredentials(toolRepoDir, toolName, credentialWarnings);
    }
  }

  const stalePathWarnings: string[] = [];
  const homeDir = process.env.HOME || "/home";
  for (const [toolName] of Object.entries(manifest.tools || {})) {
    const toolRepoDir = join(repoDir, toolName);
    if (existsSync(toolRepoDir)) {
      scanForStalePaths(toolRepoDir, toolName, homeDir, stalePathWarnings);
    }
  }

  const unmanagedFiles: string[] = [];
  const missingFiles: string[] = [];
  for (const toolName of Object.keys(manifest.tools || {})) {
    const resolved = resolveFiles(manifest, repoDir, toolName);
    for (const f of resolved.files) {
      if (f.state === "machine-only") {
        unmanagedFiles.push(`${toolName}/${f.relativePath}`);
      }
      if (f.state === "repo-only") {
        missingFiles.push(`${toolName}/${f.relativePath} — in repo but missing on machine`);
      }
    }
  }

  const healthy = schemaErrors.length === 0 && credentialWarnings.length === 0 &&
    stalePathWarnings.length === 0 && missingFiles.length === 0;

  return { schemaErrors, credentialWarnings, stalePathWarnings, unmanagedFiles, missingFiles, healthy };
}

function scanForCredentials(dir: string, prefix: string, warnings: string[]): void {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        for (const pattern of CREDENTIAL_PATTERNS) {
          if (pattern.startsWith("*")) {
            if (entry.name.endsWith(pattern.slice(1))) {
              warnings.push(`${prefix}/${entry.name} — matches credential pattern ${pattern}`);
            }
          } else if (entry.name === pattern) {
            warnings.push(`${prefix}/${entry.name} — credential file found in repo!`);
          }
        }
      } else if (entry.isDirectory()) {
        scanForCredentials(join(dir, entry.name), `${prefix}/${entry.name}`, warnings);
      }
    }
  } catch { /* ignore permission errors */ }
}

function scanForStalePaths(dir: string, prefix: string, homeDir: string, warnings: string[]): void {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith(".json") || entry.name.endsWith(".toml"))) {
        const content = readFileSync(join(dir, entry.name), "utf-8");
        if (content.includes(homeDir)) {
          warnings.push(`${prefix}/${entry.name} — contains absolute path "${homeDir}" (may not work on another machine)`);
        }
      } else if (entry.isDirectory()) {
        scanForStalePaths(join(dir, entry.name), `${prefix}/${entry.name}`, homeDir, warnings);
      }
    }
  } catch { /* ignore permission errors */ }
}
