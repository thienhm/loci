<p align="center">
  <img src="packages/web/src/assets/logo.svg" alt="Loci Logo" width="128" />
</p>

# 🗂️ Loci

**Local-first AI ticket management.** Run it in any project, track work with your AI assistant via CLI or MCP.

## Why Loci?

Loci is a lightweight ticket system that runs entirely on your machine — no cloud, no subscription, no sync issues.
Your AI coding assistant (Claude, Gemini, Cursor, etc.) can read and update tickets directly via the `loci` CLI or MCP.

## Install

**Requirements:** [Bun](https://bun.sh) ≥ 1.0

```bash
bun install -g github:thienhm/loci
```

## Quick Start

```bash
# In your project directory
loci init

# Start the server + web UI
loci serve

# Open the web UI in your browser
loci open
```

The web UI is available at **http://localhost:3333** by default.

## Connect Your AI Assistant

### CLI (Recommended)

Install the Loci skill so your AI agent can use the CLI directly — no server required, lower token usage:

```bash
loci skill install
```

This writes a `LOCI.md` into your project that teaches your AI assistant how to use `loci` CLI commands.

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
| `loci serve` | Start the MCP server and web UI |
| `loci open` | Open the web UI in your browser |
| `loci update` | Pull the latest Loci version |
| `loci skill install` | Install the AI agent skill into your project |

### Tickets

| Command | Description |
|---------|-------------|
| `loci list [--json]` | List all tickets |
| `loci add "title" [--priority p1\|p2\|p3] [--json]` | Create a new ticket |
| `loci get <id> [--json]` | Get a ticket by ID |
| `loci status <id> <status> [--json]` | Update ticket status |
| `loci patch <id> [--assignee] [--progress] [--priority] [--labels] [--json]` | Update ticket fields |
| `loci sync` | Regenerate LOCI.md and restructure .loci folder |

### Docs & Attachments

| Command | Description |
|---------|-------------|
| `loci doc read <id> <filename> [--json]` | Read a ticket document |
| `loci doc write <id> <filename> --content "..."` | Write a ticket document |
| `loci attachments <id> [--json]` | List attachments for a ticket |

## How It Works

- Tickets are stored in `.loci/` in your project root (gitignored by default)
- Each ticket is a directory with a `ticket.json`, `description.md`, and optional docs
- The CLI reads directly from disk — no server needed for most operations
- The MCP server and web UI (Kanban board + list view) are served by `loci serve`

## Migrating from v0.1.x

See [MIGRATION.md](MIGRATION.md) for the MCP → CLI migration guide.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
