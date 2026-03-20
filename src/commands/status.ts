import { resolveFiles } from "../lib/resolve.js";
import type { Manifest, FileState } from "../types.js";

interface ToolStatus {
  name: string;
  counts: Record<FileState, number>;
  total: number;
}

interface StatusResult {
  tools: ToolStatus[];
  allInSync: boolean;
}

export function runStatus(options: { manifest: Manifest; repoDir: string; only?: string }): StatusResult {
  const { manifest, repoDir, only } = options;
  const toolNames = only ? [only] : Object.keys(manifest.tools);
  const tools: ToolStatus[] = [];

  for (const name of toolNames) {
    const resolved = resolveFiles(manifest, repoDir, name);
    const counts: Record<FileState, number> = { "in-sync": 0, modified: 0, "repo-only": 0, "machine-only": 0 };
    for (const f of resolved.files) { counts[f.state]++; }
    tools.push({ name, counts, total: resolved.files.length });
  }

  const allInSync = tools.every(
    (t) => t.counts.modified === 0 && t.counts["repo-only"] === 0 && t.counts["machine-only"] === 0
  );
  return { tools, allInSync };
}
