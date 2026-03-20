import type { ToolProfile } from "../types.js";

export function generateGitignore(profiles: ToolProfile[]): string {
  const lines: string[] = [
    "# dotai — auto-generated .gitignore",
    "# Do not sync credentials, ephemeral data, or OS files",
    "",
    "# OS",
    ".DS_Store",
    "Thumbs.db",
    "",
    "# Credentials (NEVER commit these)",
  ];
  const creds = new Set<string>();
  for (const profile of profiles) {
    for (const c of profile.credentials) {
      creds.add(c);
    }
  }
  for (const c of Array.from(creds).sort()) {
    lines.push(c);
  }
  lines.push("");
  lines.push("# Common sensitive files");
  lines.push(".env");
  lines.push(".env.*");
  lines.push("*.key");
  lines.push("*.pem");
  lines.push("");
  return lines.join("\n") + "\n";
}
