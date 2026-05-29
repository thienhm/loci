<p align="center">
  <img src="packages/web/src/assets/logo.svg" alt="Loci Logo" width="128" />
</p>

# 🗂️ Loci

**Local-first harness and ticket operations.** Run it in any project, track work with your AI assistant via CLI or MCP.

## Why Loci?

Loci is a lightweight local-first harness system that runs entirely on your machine.
Your AI coding assistant (Claude, Gemini, Cursor, etc.) can read and update workflow tickets directly via `loci` CLI or MCP.

## Install

Recommended one-line install (macOS Apple Silicon + Linux x86_64/aarch64):

```bash
curl -fsSL https://raw.githubusercontent.com/thienhm/loci/main/scripts/install.sh | bash
```

Install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/thienhm/loci/main/scripts/install.sh | bash -s -- v2.0.0
```

Transition bootstrap (legacy Bun launcher):

```bash
bun install -g github:thienhm/loci
loci update
```

During the transition, `loci update` refreshes both the managed Rust binary and the global Bun package that still provides `loci serve` and `loci open`.

Managed binary location: `~/.loci/bin/loci`

## Quick Start

```bash
# In your project directory
loci init

# Optional: start the server + web UI
loci serve

# Optional: open the web UI in your browser
loci open
```

The web UI is available at **http://localhost:3333** by default.

## Connect Your AI Assistant

### CLI (Recommended)

Use the local CLI directly in your agent workflow. `loci init` generates project instructions and foundation docs:

- `AGENTS.md`
- `LOCI.md`
- `loci/project.md`
- `loci/architecture.md`
- `loci/validation.md`
- `loci/guardrails.md`
- `loci/current-state.md`
- `loci/glossary.md`
- `loci/backlog.md`

### MCP

Loci also exposes an MCP server at `http://localhost:3333/mcp` (requires `loci serve` to be running).

**Claude Desktop / Claude Code**

```json
{
  "mcpServers": {
    "loci": {
      "url": "http://localhost:3333/mcp"
    }
  }
}
```

**Gemini CLI (`~/.gemini/settings.json`)**

```json
{
  "mcpServers": {
    "loci": {
      "url": "http://localhost:3333/mcp"
    }
  }
}
```

**Cursor / Windsurf**

```json
{
  "loci": {
    "url": "http://localhost:3333/mcp"
  }
}
```

## CLI Reference

### Project

| Command | Description |
|---------|-------------|
| `loci init` | Initialize Loci in the current project |
| `loci doctor` | Check harness/project health |
| `loci serve` | Start the MCP server and web UI |
| `loci open` | Open the web UI in your browser |
| `loci update` | Update the managed Rust binary and transitional Bun wrapper |
| `loci upgrade` | Upgrade project templates/data |

### Tickets

| Command | Description |
|---------|-------------|
| `loci list [--json]` | List workflow tickets |
| `loci add "title" [--json]` | Create a workflow ticket |
| `loci get <id> [--json]` | Get one ticket by ID |
| `loci status <id> <status> [--json]` | Update ticket status |
| `loci patch <id> [--assignee] [--progress] [--priority] [--labels] [--json]` | Update ticket fields |
| `loci plan`, `loci ready`, `loci validate`, `loci evidence`, `loci trace`, `loci summary`, `loci review` | Harness workflow commands |

### Docs & Attachments

| Command | Description |
|---------|-------------|
| `loci doc read <id> <filename> [--json]` | Read a ticket document |
| `loci doc write <id> <filename> --content "..."` | Write a ticket document |
| `loci attachments <id> [--json]` | List attachments for a ticket |

## How It Works

- Project docs live under `loci/` (human/agent-visible context and workflow packets)
- Operational state lives under `.loci/` (SQLite + local tool state)
- The CLI is local-first and does not require a running server for core workflows
- The MCP server and web UI are served by `loci serve`

## Updating

```bash
loci update
```

This installs the managed Rust binary and refreshes the global Bun `loci` package so TypeScript fallback commands such as `loci serve` use the latest server/web code. If the wrapper refresh fails, the command prints the manual recovery command:

```bash
bun remove -g loci && bun install -g github:thienhm/loci
```

If you're on an older install and `loci update` cannot run yet, bootstrap once manually:

```bash
bun remove -g loci && bun install -g github:thienhm/loci
```

Then run:

```bash
loci update
```

## Migration Notes

- `loci sync` has been retired. Use `loci upgrade`.
- `loci skill` has been retired from product CLI.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
