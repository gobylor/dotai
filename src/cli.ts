#!/usr/bin/env node
import { Command } from "commander";
import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { readManifest } from "./lib/manifest.js";
import { runInit } from "./commands/init.js";
import { runExport } from "./commands/export.js";
import { runImport } from "./commands/import.js";
import { runDiff } from "./commands/diff.js";
import { runStatus } from "./commands/status.js";
import { runUse } from "./commands/use.js";
import { runDoctor } from "./commands/doctor.js";
import type { FileState } from "./types.js";

const BACKUP_BASE = join(process.env.HOME || "", ".dotai-backup");

function getManifest(repoDir: string) {
  const manifestPath = join(repoDir, "dotai.json");
  if (!existsSync(manifestPath)) {
    console.error(chalk.red("No dotai.json found. Run `dotai init` first."));
    process.exit(1);
  }
  return readManifest(manifestPath);
}

const program = new Command();
program.name("dotai").description("AI CLI config manager").version("0.1.0");

// --- init ---
program
  .command("init")
  .description("Auto-discover AI CLIs and generate manifest")
  .action(() => {
    const repoDir = process.cwd();
    const result = runInit({ repoDir });
    for (const w of result.warnings) console.log(chalk.yellow(`⚠ ${w}`));
    if (result.toolsFound.length > 0) {
      console.log(chalk.green(`✅ Generated dotai.json with ${result.toolsFound.length} tool(s): ${result.toolsFound.join(", ")}`));
    }
  });

// --- export ---
program
  .command("export")
  .description("Copy configs from machine to repo")
  .option("--only <tool>", "Export only one tool")
  .option("--verbose", "Show each file copied", false)
  .action((opts) => {
    const repoDir = process.cwd();
    const manifest = getManifest(repoDir);
    const result = runExport({ manifest, repoDir, verbose: opts.verbose, only: opts.only });
    console.log(chalk.green(`✅ Exported ${result.toolsExported.join(", ")} (${result.filesCopied} items)`));
  });

// --- import ---
program
  .command("import")
  .description("Copy configs from repo to machine")
  .option("--only <tool>", "Import only one tool")
  .option("--dry-run", "Show what would change without writing", false)
  .option("--sync", "Delete machine files not in repo (with backup)", false)
  .option("--verbose", "Show each file copied", false)
  .action((opts) => {
    const repoDir = process.cwd();
    const manifest = getManifest(repoDir);
    const result = runImport({
      manifest, repoDir, verbose: opts.verbose, dryRun: opts.dryRun,
      sync: opts.sync, only: opts.only, backupBase: BACKUP_BASE,
    });
    if (opts.dryRun) {
      console.log(chalk.yellow("Dry run — no changes made."));
    } else {
      console.log(chalk.green(`✅ Imported ${result.toolsImported.join(", ")} (${result.filesImported} files)`));
      for (const bp of result.backupPaths) console.log(`  Backup: ${bp}`);
      if (result.filesDeleted > 0) console.log(`  Deleted ${result.filesDeleted} machine-only files (--sync)`);
    }
  });

// --- diff ---
program
  .command("diff")
  .description("Show differences between repo and machine")
  .option("--only <tool>", "Diff only one tool")
  .action((opts) => {
    const repoDir = process.cwd();
    const manifest = getManifest(repoDir);
    const result = runDiff({ manifest, repoDir, only: opts.only });
    const stateIcon: Record<FileState, string> = {
      "in-sync": chalk.green("="),
      modified: chalk.yellow("~"),
      "repo-only": chalk.blue("+"),
      "machine-only": chalk.red("-"),
    };
    for (const tool of result.tools) {
      console.log(chalk.bold(`\n${tool.name}:`));
      for (const f of tool.files) {
        if (f.state !== "in-sync") {
          console.log(`  ${stateIcon[f.state]} ${f.relativePath}`);
        }
      }
      const inSync = tool.files.filter((f) => f.state === "in-sync").length;
      if (inSync === tool.files.length) console.log(chalk.green("  Everything in sync"));
    }
  });

// --- status ---
program
  .command("status")
  .description("Sync summary dashboard")
  .option("--only <tool>", "Status for only one tool")
  .action((opts) => {
    const repoDir = process.cwd();
    const manifest = getManifest(repoDir);
    const result = runStatus({ manifest, repoDir, only: opts.only });
    for (const tool of result.tools) {
      console.log(chalk.bold(`${tool.name}: `) +
        `${tool.counts["in-sync"]} synced, ` +
        `${tool.counts.modified} modified, ` +
        `${tool.counts["repo-only"]} repo-only, ` +
        `${tool.counts["machine-only"]} machine-only`
      );
    }
    console.log(result.allInSync ? chalk.green("\n✅ All in sync") : chalk.yellow("\n⚠ Out of sync"));
  });

// --- use ---
program
  .command("use <repo>")
  .description("Import config from a GitHub repo (owner/repo)")
  .option("--dry-run", "Show what would change without writing", false)
  .option("--verbose", "Show details", false)
  .action((repo, opts) => {
    runUse({ repoArg: repo, dryRun: opts.dryRun, verbose: opts.verbose, backupBase: BACKUP_BASE });
    if (!opts.dryRun) console.log(chalk.green("✅ Config imported successfully"));
  });

// --- doctor ---
program
  .command("doctor")
  .description("Health check: validate manifest, scan for issues")
  .action(() => {
    const repoDir = process.cwd();
    const manifest = getManifest(repoDir);
    const result = runDoctor({ manifest, repoDir });
    if (result.schemaErrors.length > 0) {
      console.log(chalk.red("Schema errors:"));
      result.schemaErrors.forEach((e) => console.log(`  ❌ ${e}`));
    }
    if (result.credentialWarnings.length > 0) {
      console.log(chalk.red("\nCredential warnings:"));
      result.credentialWarnings.forEach((w) => console.log(`  ❌ ${w}`));
    }
    if (result.stalePathWarnings.length > 0) {
      console.log(chalk.yellow("\nStale path warnings:"));
      result.stalePathWarnings.forEach((w) => console.log(`  ⚠ ${w}`));
    }
    if (result.missingFiles.length > 0) {
      console.log(chalk.yellow("\nMissing files (in repo but not on machine):"));
      result.missingFiles.forEach((f) => console.log(`  ⚠ ${f}`));
    }
    if (result.unmanagedFiles.length > 0) {
      console.log(chalk.yellow("\nFiles on machine not in repo:"));
      result.unmanagedFiles.forEach((f) => console.log(`  ? ${f}`));
    }
    if (result.healthy) {
      console.log(chalk.green("✅ All checks passed"));
    }
  });

program.parse();
