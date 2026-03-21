# Contributing to dotai

## Adding a New AI CLI Profile

The easiest way to contribute is adding support for a new AI CLI tool.

1. Create a profile JSON file in `src/profiles/`:

```json
{
  "name": "your-cli",
  "description": "Your CLI Tool",
  "configDir": "~/.your-cli",
  "portable": ["settings.json", "config/"],
  "ephemeral": ["cache/", "sessions/", "history.jsonl"],
  "credentials": ["auth.json", ".env"]
}
```

2. Add the filename to the `profileFiles` array in `src/lib/profiles.ts`

3. Add tests and submit a PR

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Run tests in watch mode
bun test:watch

# Run CLI in development
bun run src/cli.ts <command>

# Build for distribution
bun run build
```

## Project Structure

```
src/
├── cli.ts              # CLI entry point (commander)
├── types.ts            # TypeScript interfaces
├── profiles/           # Built-in tool profiles (JSON)
├── lib/                # Core library
│   ├── manifest.ts     # Parse + validate dotai.json
│   ├── resolve.ts      # Core file state engine
│   ├── fileops.ts      # Copy, backup, compare
│   ├── profiles.ts     # Load tool profiles
│   ├── readme.ts       # Generate README
│   └── gitignore.ts    # Generate .gitignore
└── commands/           # CLI commands (thin wrappers over lib)
```

## Testing

All tests use real file systems (temp directories), not mocks. Run with:

```bash
bun test                          # all tests
bun test tests/lib/resolve.test.ts  # specific file
```
