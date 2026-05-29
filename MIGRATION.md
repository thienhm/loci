# Migration Guide

## v2.0.0 → v2.0.1: Patch Update

This patch release does not require a project data migration.

### Steps

1. **Update Loci**

   ```bash
   loci update
   ```

   During the Rust-primary transition, this refreshes both the managed Rust binary and the global Bun package that still provides `loci serve` and `loci open`.

2. **Manual recovery if the wrapper is stale**

   If `loci update` cannot run yet, or if it reports that the TypeScript wrapper refresh failed, refresh the Bun layer manually:

   ```bash
   bun remove -g loci && bun install -g github:thienhm/loci
   ```

   Then run:

   ```bash
   loci update
   ```

## v0.1.3 → v0.1.4: MCP to CLI

The recommended way for AI agents to interact with Loci has changed from MCP tools to the `loci` CLI. This reduces context window usage and token costs — the CLI reads directly from disk without requiring the server.

**MCP remains fully functional.** This is not a breaking change.

### Steps

1. **Update Loci**

   ```bash
   loci update
   ```

2. **Remove the MCP server from your AI tool config** (optional — only if you want to stop loading MCP schemas)

   In your Claude Code settings (`.claude/settings.json` or `~/.claude/settings.json`), remove the Loci MCP server entry:

   ```json
   // Remove this block:
   {
     "mcpServers": {
       "loci": { ... }
     }
   }
   ```

3. **Update `LOCI.md` in your project**

   Replace the `## MCP Tools Available` section with `## CLI Tools Available`. See the `LOCI.md` in this repo for the reference table.

4. **Verify**

   ```bash
   loci list --json
   loci get <your-ticket-id> --json
   ```

### MCP ↔ CLI Reference

| MCP Tool | CLI Equivalent |
|---|---|
| `list_tickets()` | `loci list --json` |
| `get_ticket(id)` | `loci get <id> --json` |
| `create_ticket(title, ...)` | `loci add "title" [--priority] --json` |
| `update_ticket(id, { status })` | `loci status <id> <status> --json` |
| `update_ticket(id, { assignee, progress, priority, labels })` | `loci patch <id> [--assignee] [--progress] [--priority] [--labels] --json` |
| `read_ticket_doc(id, filename)` | `loci doc read <id> <filename> --json` |
| `write_ticket_doc(id, filename, content)` | `loci doc write <id> <filename> --content "..."` |
| `list_attachments(id)` | `loci attachments <id> --json` |
