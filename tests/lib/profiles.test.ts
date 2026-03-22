import { describe, it, expect } from "vitest";
import { loadBuiltinProfiles, getProfile } from "../../src/lib/profiles";

describe("profiles", () => {
  it("loads built-in claude profile", () => {
    const profiles = loadBuiltinProfiles();
    expect(profiles).toHaveProperty("claude");
    expect(profiles.claude.configDir).toBe("~/.claude");
    expect(profiles.claude.portable).toContain("settings.json");
  });
  it("loads built-in codex profile", () => {
    const profiles = loadBuiltinProfiles();
    expect(profiles).toHaveProperty("codex");
    expect(profiles.codex.configDir).toBe("~/.codex");
    expect(profiles.codex.portable).toContain("config.toml");
  });
  it("getProfile returns profile by name", () => {
    const profile = getProfile("claude");
    expect(profile).not.toBeNull();
    expect(profile!.name).toBe("claude");
  });
  it("getProfile returns null for unknown", () => {
    const profile = getProfile("unknown-tool");
    expect(profile).toBeNull();
  });
  it("discovers all .json files in profiles directory", () => {
    const profiles = loadBuiltinProfiles();
    const names = Object.keys(profiles);
    expect(names).toContain("claude");
    expect(names).toContain("codex");
    for (const profile of Object.values(profiles)) {
      expect(profile.name).toBeDefined();
      expect(profile.configDir).toBeDefined();
      expect(Array.isArray(profile.portable)).toBe(true);
    }
  });
});
