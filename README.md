# dotai

AI CLI config manager — sync Claude Code, Codex, and more between machines.

## What is this?

`dotai` is a dotfiles manager for the AI coding era. It syncs your AI CLI configurations (settings, permissions, skills, commands, plugins) between machines via a JSON manifest backed by Git.

**Two dimensions, one tool:**
- **Horizontal:** manage configs for Claude Code + Codex (+ future CLIs) on one machine
- **Vertical:** sync all configs between machines

## Quick Start

```bash
# In your config repo directory:
npx @openlor/dotai init          # Auto-discover CLIs, generate manifest
npx @openlor/dotai export        # Copy configs from machine to repo
git add -A && git commit -m "my ai config"
git push

# On another machine:
npx @openlor/dotai use <your-github-user>/dotai-config
```

## Commands

| Command | Description |
|---------|-------------|
| `dotai init` | Auto-discover AI CLIs, generate `dotai.json` manifest + `.gitignore` |
| `dotai export` | Copy configs from machine to repo, auto-generate README |
| `dotai import` | Copy configs from repo to machine (with backup), restore plugins |
| `dotai diff` | Show differences between repo and machine |
| `dotai status` | Sync summary dashboard |
| `dotai use <user/repo>` | Import config from a GitHub repo |
| `dotai doctor` | Health check: validate manifest, scan for credentials, flag stale paths |

### Common Flags

| Flag | Available on | Description |
|------|-------------|-------------|
| `--only <tool>` | export, import, diff, status | Operate on a single tool only |
| `--dry-run` | import, use | Preview changes without writing |
| `--sync` | import | Delete machine files not in repo (with backup) |
| `--skip-plugins` | import, use | Skip automatic plugin restore |
| `--verbose` | export, import, use | Show per-file operations |

## How It Works

### 1. Manifest (`dotai.json`)

A JSON file declares which files from each CLI's config directory should be synced:

```json
{
  "version": 1,
  "tools": {
    "claude": {
      "source": "~/.claude",
      "include": ["settings.json", "commands/", "skills/"],
      "exclude": ["sessions/", "cache/", "history.jsonl"]
    },
    "codex": {
      "source": "~/.codex",
      "include": ["config.toml", "rules/", "skills/"],
      "exclude": ["history.jsonl", "sessions/", "auth.json"]
    }
  }
}
```

### 2. Tool Profiles

Built-in profiles for Claude Code and Codex know which files are portable (settings, commands, skills) and which are ephemeral (sessions, cache, history). `dotai init` uses these profiles to auto-generate the manifest.

Adding support for a new AI CLI is as simple as adding a JSON profile file.

### 3. File State Model

Every managed file is in one of four states:

| State | Meaning |
|-------|---------|
| `in-sync` | Identical in repo and on machine |
| `modified` | Exists in both but content differs |
| `repo-only` | In repo but not on machine |
| `machine-only` | On machine but not in repo |

### 4. Plugin Sync (Claude Code)

When importing Claude Code configs, dotai automatically restores your plugins:
1. Registers missing marketplaces via `claude plugins marketplace add`
2. Installs missing plugins via `claude plugins install`
3. Skips local/project-scoped plugins with a warning

Use `--skip-plugins` to disable, or `--dry-run` to preview.

### 5. Security

- **No transformation** — files are copied exactly as-is
- `dotai doctor` scans for credential files accidentally in repo (auth.json, *.key, *.pem, id_rsa, .netrc, and more)
- `dotai use` restricts source paths to known AI CLI config directories
- Plugin/marketplace arguments validated against strict regexes to prevent injection from untrusted repos
- Marketplace URLs restricted to known Git hosts (github.com, gitlab.com, bitbucket.org) — extend via `DOTAI_ALLOWED_DOMAINS` env var
- Symlinks in config directories are skipped to prevent path traversal attacks
- Auto-generated `.gitignore` excludes credentials and ephemeral data

## Design Principles

- **No transformation** — JSON stays JSON, TOML stays TOML. No path rewriting.
- **Additive by default** — `import` only copies, never deletes (unless `--sync`)
- **Backup before overwrite** — every import creates a timestamped backup per tool
- **Two-repo model** — this repo is the tool; your configs live in a separate repo

## Supported CLIs

| CLI | Config Dir | Status |
|-----|-----------|--------|
| Claude Code | `~/.claude` | Built-in |
| Codex | `~/.codex` | Built-in |
| Cursor | `~/.cursor` | Add profile |
| Windsurf | `~/.windsurf` | Add profile |
| Aider | `~/.aider` | Add profile |

## Installation

```bash
# Use without installing (recommended)
npx @openlor/dotai <command>

# Or install globally
npm install -g @openlor/dotai
bun install -g @openlor/dotai
```

Requires Node.js >= 18 or Bun.

## License

MIT
