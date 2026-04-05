# 🗂️ Loci

**Local-first AI ticket management.** Run it in any project, track work with your AI assistant via MCP.

## Why Loci?

Loci is a lightweight ticket system that runs entirely on your machine — no cloud, no subscription, no sync issues.
It speaks MCP natively, so your AI coding assistant (Claude, Gemini, Cursor, etc.) can read and update tickets directly.

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

Loci exposes an MCP server at `http://localhost:3333/mcp`. Add it to your AI config:

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "loci": {
      "url": "http://localhost:3333/mcp"
    }
  }
}
```

### Gemini CLI (`~/.gemini/settings.json`)

```json
{
  "mcpServers": {
    "loci": {
      "url": "http://localhost:3333/mcp"
    }
  }
}
```

### Cursor / Windsurf

```json
{
  "loci": {
    "url": "http://localhost:3333/mcp"
  }
}
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `loci init` | Initialize Loci in the current project |
| `loci serve` | Start the MCP server and web UI |
| `loci open` | Open the web UI in your browser |
| `loci add "ticket title"` | Create a new ticket |
| `loci list` | List all tickets |
| `loci status <id> <status>` | Update ticket status |
| `loci update` | Pull the latest Loci version and update the CLI |
| `loci sync` | Regenerate LOCI.md and restructure .loci folder |

## How It Works

- Tickets are stored in `.loci/` in your project root (gitignored by default)
- Each ticket is a JSON file — portable and inspectable
- The MCP server exposes ticket CRUD operations to AI tools
- The web UI (Kanban board + list view) is served by the same process

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
