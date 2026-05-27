# CLI Command Parity Decisions

LCI-055 resolves the TypeScript-only commands left after the Rust-primary bridge.

## Decisions

| Command | Decision | Rationale | Migration guidance |
| --- | --- | --- | --- |
| `serve` | Keep TypeScript fallback | It starts the Fastify/web dashboard from the Bun packages. Server packaging is not part of the Rust CLI cutover yet. | Continue using `loci serve` through the bridge until server distribution is redesigned. |
| `open` | Keep TypeScript fallback | It opens the current project in the local web dashboard and depends on the current dashboard/server URL contract. | Continue using `loci open` through the bridge. |
| `status` | Keep TypeScript fallback pending LCI-056 | It mutates legacy JSON tickets. Porting it now would decide SQLite write-side ownership before the write-side cutover plan. | Use the bridge fallback for legacy projects; SQLite-backed mutation design belongs to LCI-056 follow-up work. |
| `patch` | Keep TypeScript fallback pending LCI-056 | It mutates legacy JSON ticket fields. The Rust CLI should not add a second mutation path until dashboard/server/CLI write ownership is designed. | Use the bridge fallback for legacy projects; port with SQLite write-side implementation after LCI-056. |
| `doc` | Keep TypeScript fallback pending LCI-056 | It reads and writes legacy ticket docs. Rust-backed docs require known doc path columns and conflict policy from the write-side cutover. | Use the bridge fallback for legacy projects; port after the doc write policy is reviewed. |
| `attachments` | Keep TypeScript fallback pending LCI-056 | It reads legacy `attachments.json`. File and attachment ownership is explicitly part of the write-side cutover plan. | Use the bridge fallback for legacy projects; port with attachment/file write-side work. |
| `sync` | Retire | It rewrites `LOCI.md` and migrates legacy archived ticket layout. Rust `loci upgrade` is now the project-data/template upgrade boundary. | Use `loci upgrade` for project template/doc upgrades. |
| `skill` | Retire from product CLI | It installs a Claude-specific skill and is agent-tooling distribution, not Loci project/runtime behavior. | Install or update skills through the agent tooling, or copy `skills/loci/SKILL.md` manually. |

## Bridge Result

The TypeScript fallback table is reduced to:

- `serve`
- `open`
- `status`
- `patch`
- `doc`
- `attachments`

The bridge blocks retired commands with migration guidance instead of loading their legacy TypeScript implementations.
