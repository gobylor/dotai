import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers";
import { copyFile, copyDir, createBackup, filesAreEqual } from "../../src/lib/fileops";

let tempDir: string;
beforeEach(() => { tempDir = createTempDir(); });
afterEach(() => { cleanupTempDir(tempDir); });

describe("copyFile", () => {
  it("copies a file to destination", () => {
    const src = join(tempDir, "src.txt");
    const dst = join(tempDir, "dst.txt");
    writeFileSync(src, "hello");
    copyFile(src, dst);
    expect(readFileSync(dst, "utf-8")).toBe("hello");
  });
  it("creates parent directories if needed", () => {
    const src = join(tempDir, "src.txt");
    const dst = join(tempDir, "deep", "nested", "dst.txt");
    writeFileSync(src, "hello");
    copyFile(src, dst);
    expect(readFileSync(dst, "utf-8")).toBe("hello");
  });
});

describe("copyDir", () => {
  it("copies directory recursively", () => {
    const src = join(tempDir, "srcdir");
    const dst = join(tempDir, "dstdir");
    writeFixture(src, "a.txt", "aaa");
    writeFixture(src, "sub/b.txt", "bbb");
    copyDir(src, dst);
    expect(readFileSync(join(dst, "a.txt"), "utf-8")).toBe("aaa");
    expect(readFileSync(join(dst, "sub/b.txt"), "utf-8")).toBe("bbb");
  });
  it("skips nested .git directories", () => {
    const src = join(tempDir, "srcdir");
    const dst = join(tempDir, "dstdir");
    writeFixture(src, "a.txt", "aaa");
    writeFixture(src, ".git/config", "gitdata");
    writeFixture(src, "skill/.git/HEAD", "ref");
    writeFixture(src, "skill/SKILL.md", "skill");
    copyDir(src, dst);
    expect(existsSync(join(dst, "a.txt"))).toBe(true);
    expect(existsSync(join(dst, ".git"))).toBe(false);
    expect(existsSync(join(dst, "skill/.git"))).toBe(false);
    expect(existsSync(join(dst, "skill/SKILL.md"))).toBe(true);
  });
});

describe("createBackup", () => {
  it("copies directory to labeled backup location", () => {
    const src = join(tempDir, "config");
    const backupBase = join(tempDir, "backups");
    writeFixture(src, "settings.json", '{"a":1}');
    const backupPath = createBackup(src, backupBase, "claude");
    expect(backupPath).toContain("claude");
    expect(existsSync(join(backupPath, "settings.json"))).toBe(true);
    expect(readFileSync(join(backupPath, "settings.json"), "utf-8")).toBe('{"a":1}');
  });
  it("keeps separate backups for different tools", () => {
    const src1 = join(tempDir, "claude");
    const src2 = join(tempDir, "codex");
    const backupBase = join(tempDir, "backups");
    writeFixture(src1, "settings.json", '{"tool":"claude"}');
    writeFixture(src2, "config.toml", 'tool = "codex"');
    const bp1 = createBackup(src1, backupBase, "claude");
    const bp2 = createBackup(src2, backupBase, "codex");
    expect(bp1).not.toBe(bp2);
    expect(readFileSync(join(bp1, "settings.json"), "utf-8")).toContain("claude");
    expect(readFileSync(join(bp2, "config.toml"), "utf-8")).toContain("codex");
  });
});

describe("createBackup with filesToBackup", () => {
  it("only copies specified files when filesToBackup is provided", () => {
    const src = join(tempDir, "config");
    const backupBase = join(tempDir, "backups");
    writeFixture(src, "a.json", '{"a":1}');
    writeFixture(src, "b.json", '{"b":2}');
    writeFixture(src, "c.json", '{"c":3}');
    const backupPath = createBackup(src, backupBase, "claude", ["a.json"]);
    expect(existsSync(join(backupPath, "a.json"))).toBe(true);
    expect(existsSync(join(backupPath, "b.json"))).toBe(false);
    expect(existsSync(join(backupPath, "c.json"))).toBe(false);
    expect(readFileSync(join(backupPath, "a.json"), "utf-8")).toBe('{"a":1}');
  });
  it("copies everything when filesToBackup is not provided", () => {
    const src = join(tempDir, "config");
    const backupBase = join(tempDir, "backups");
    writeFixture(src, "a.json", '{"a":1}');
    writeFixture(src, "b.json", '{"b":2}');
    const backupPath = createBackup(src, backupBase, "claude");
    expect(existsSync(join(backupPath, "a.json"))).toBe(true);
    expect(existsSync(join(backupPath, "b.json"))).toBe(true);
  });
});

describe("filesAreEqual", () => {
  it("returns true for identical files", () => {
    writeFixture(tempDir, "a.txt", "same");
    writeFixture(tempDir, "b.txt", "same");
    expect(filesAreEqual(join(tempDir, "a.txt"), join(tempDir, "b.txt"))).toBe(true);
  });
  it("returns false for different files", () => {
    writeFixture(tempDir, "a.txt", "one");
    writeFixture(tempDir, "b.txt", "two");
    expect(filesAreEqual(join(tempDir, "a.txt"), join(tempDir, "b.txt"))).toBe(false);
  });
  it("returns false immediately when file sizes differ", () => {
    writeFixture(tempDir, "small.txt", "hi");
    writeFixture(tempDir, "large.txt", "hello world this is much longer");
    expect(filesAreEqual(join(tempDir, "small.txt"), join(tempDir, "large.txt"))).toBe(false);
  });
  it("returns false when one file does not exist", () => {
    writeFixture(tempDir, "exists.txt", "hello");
    expect(filesAreEqual(join(tempDir, "exists.txt"), join(tempDir, "missing.txt"))).toBe(false);
  });
});
