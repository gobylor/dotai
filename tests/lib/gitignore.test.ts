import { describe, it, expect } from "vitest";
import { generateGitignore } from "../../src/lib/gitignore";
import type { ToolProfile } from "../../src/types";

describe("generateGitignore", () => {
  it("includes credential patterns", () => {
    const profiles: ToolProfile[] = [
      { name: "test", description: "", configDir: "~/.test", portable: [], ephemeral: [], credentials: ["auth.json", ".env"] },
    ];
    const gitignore = generateGitignore(profiles);
    expect(gitignore).toContain("auth.json");
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain(".DS_Store");
  });

  it("generates gitignore for empty profiles array", () => {
    const gitignore = generateGitignore([]);
    expect(gitignore).toContain(".DS_Store");
    expect(gitignore).toContain("Thumbs.db");
    expect(gitignore).toContain(".env");
  });

  it("deduplicates credential entries from multiple profiles", () => {
    const profiles: ToolProfile[] = [
      { name: "tool1", description: "", configDir: "~/.tool1", portable: [], ephemeral: [], credentials: ["auth.json", "token.json"] },
      { name: "tool2", description: "", configDir: "~/.tool2", portable: [], ephemeral: [], credentials: ["auth.json", "secret.key"] },
    ];
    const gitignore = generateGitignore(profiles);
    // auth.json should appear only once in the credentials section
    const matches = gitignore.match(/^auth\.json$/gm);
    expect(matches).toHaveLength(1);
  });

  it("sorts credential entries alphabetically", () => {
    const profiles: ToolProfile[] = [
      { name: "test", description: "", configDir: "~/.test", portable: [], ephemeral: [], credentials: ["zebra.json", "alpha.json", "middle.json"] },
    ];
    const gitignore = generateGitignore(profiles);
    const lines = gitignore.split("\n");
    const credLines = lines.filter((l) => ["alpha.json", "middle.json", "zebra.json"].includes(l));
    expect(credLines).toEqual(["alpha.json", "middle.json", "zebra.json"]);
  });
});
