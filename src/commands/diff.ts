import { resolveFiles } from "../lib/resolve.js";
import type { Manifest, ResolvedTool } from "../types.js";

interface DiffOptions {
  manifest: Manifest;
  repoDir: string;
  only?: string;
}

interface DiffResult {
  tools: ResolvedTool[];
}

export function runDiff(options: DiffOptions): DiffResult {
  const { manifest, repoDir, only } = options;
  const toolNames = only ? [only] : Object.keys(manifest.tools);
  const tools = toolNames.map((name) => resolveFiles(manifest, repoDir, name));
  return { tools };
}
