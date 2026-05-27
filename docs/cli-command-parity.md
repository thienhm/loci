# CLI Command Parity Decisions

LCI-055 resolves the TypeScript-only commands left after the Rust-primary bridge.

## Decisions

| Command | Decision | Rationale | Migration guidance |
| --- | --- | --- | --- |
| `serve` | Keep TypeScript fallback | It starts the Fastify/web dashboard from the Bun packages. Server packaging is not part of the Rust CLI cutover yet. | Continue using `loci serve` through the bridge until server distribution is redesigned. |
| `open` | Keep TypeScript fallback | It opens the current project in the local web dashboard and depends on the current dashboard/server URL contract. | Continue using `loci open` through the bridge. |
| `status` | Ported to Rust (LCI-059) | SQLite write-side ownership is now implemented in the Rust CLI for status changes. | Use managed Rust binary command `loci status`; bridge delegates when binary exists. |
| `patch` | Ported to Rust (LCI-059) | SQLite write-side ownership is now implemented in the Rust CLI for assignee/progress/priority/labels updates. | Use managed Rust binary command `loci patch`; bridge delegates when binary exists. |
| `doc` | Ported to Rust (LCI-059) | Rust now handles known doc path read/write behavior and rejects unknown docs with guidance. | Use managed Rust binary command `loci doc`; bridge delegates when binary exists. |
| `attachments` | Ported to Rust (LCI-060) | SQLite attachment/file metadata storage now exists, and `loci attachments` reads from `ticket_file` rows. | Use managed Rust binary command `loci attachments`; bridge delegates when binary exists. |
| `sync` | Retire | It rewrites `LOCI.md` and migrates legacy archived ticket layout. Rust `loci upgrade` is now the project-data/template upgrade boundary. | Use `loci upgrade` for project template/doc upgrades. |
| `skill` | Retire from product CLI | It installs a Claude-specific skill and is agent-tooling distribution, not Loci project/runtime behavior. | Install or update skills through the agent tooling, or copy `skills/loci/SKILL.md` manually. |

## Bridge Result

The TypeScript fallback table is reduced to:

- `serve`
- `open`

The bridge blocks retired commands with migration guidance instead of loading their legacy TypeScript implementations.
