export interface PostImportHook {
  type: "claude-plugins";
  manifestFile: string;
  marketplacesFile: string;
}

export interface ToolProfile {
  name: string;
  description: string;
  configDir: string;
  portable: string[];
  ephemeral: string[];
  credentials: string[];
  postImport?: PostImportHook;
}

export interface ManifestTool {
  source: string;
  include: string[];
  exclude: string[];
}

export interface Manifest {
  version: number;
  tools: Record<string, ManifestTool>;
}

export type FileState = "in-sync" | "modified" | "repo-only" | "machine-only";

export interface ResolvedFile {
  relativePath: string;
  repoPath: string;
  machinePath: string;
  state: FileState;
}

export interface ResolvedTool {
  name: string;
  files: ResolvedFile[];
}
