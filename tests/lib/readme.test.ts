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
});
