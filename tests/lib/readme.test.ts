import { describe, it, expect } from "vitest";
import { generateReadme } from "../../src/lib/readme";
import type { Manifest } from "../../src/types";

describe("generateReadme", () => {
  it("generates markdown with tool names and includes", () => {
    const manifest: Manifest = {
      version: 1,
      tools: {
        claude: { source: "~/.claude", include: ["settings.json", "commands/"], exclude: [] },
      },
    };
    const readme = generateReadme(manifest);
    expect(readme).toContain("# dotai config");
    expect(readme).toContain("claude");
    expect(readme).toContain("settings.json");
  });

  it("generates readme for empty manifest (no tools)", () => {
    const manifest: Manifest = { version: 1, tools: {} };
    const readme = generateReadme(manifest);
    expect(readme).toContain("# dotai config");
    expect(readme).toContain("Auto-generated");
  });

  it("generates readme for multiple tools", () => {
    const manifest: Manifest = {
      version: 1,
      tools: {
        claude: { source: "~/.claude", include: ["settings.json"], exclude: [] },
        codex: { source: "~/.codex", include: ["config.toml"], exclude: [] },
      },
    };
    const readme = generateReadme(manifest);
    expect(readme).toContain("claude");
    expect(readme).toContain("codex");
    expect(readme).toContain("settings.json");
    expect(readme).toContain("config.toml");
  });

  it("includes source and include paths in output", () => {
    const manifest: Manifest = {
      version: 1,
      tools: {
        claude: { source: "~/.claude", include: ["settings.json", "commands/"], exclude: [] },
      },
    };
    const readme = generateReadme(manifest);
    expect(readme).toContain("`~/.claude`");
    expect(readme).toContain("`settings.json`");
    expect(readme).toContain("`commands/`");
  });
});
