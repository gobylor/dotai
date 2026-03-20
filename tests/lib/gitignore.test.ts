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
});
