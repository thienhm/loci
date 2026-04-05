# Contributing to Loci

Thanks for your interest! Contributions are welcome.

## Setup

**Requirements:** [Bun](https://bun.sh) ≥ 1.0

```bash
git clone https://github.com/thienhm/loci.git
cd loci
bun install
```

## Development

```bash
# Start server + web UI with hot-reload
bun run dev

# Run all tests
bun test
```

## Project Structure

```
packages/
├── cli/        CLI commands (loci init, loci serve, ...)
├── server/     Fastify HTTP + MCP server
├── shared/     Types and data layer shared across packages
└── web/        React + Vite web UI (Kanban board, ticket editor)
```

## Making Changes

1. Fork the repo and create a branch: `git checkout -b feat/my-feature`
2. Write tests first — `bun test` runs the test suite
3. Make your changes
4. Run `bun test` to confirm everything passes
5. Commit with a descriptive message (`feat:`, `fix:`, `docs:` prefixes)
6. Open a pull request

## Code Style

- TypeScript throughout
- Match the style of nearby files
- Prefer small, focused files with clear responsibilities
- No linter/formatter config yet — consistency with existing code is the rule

## Questions?

Open an issue on GitHub.
