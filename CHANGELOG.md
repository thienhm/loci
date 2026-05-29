# Changelog

All notable user-facing changes are documented here.

## 2.0.1 - 2026-05-29

### Fixed

- `loci update` now refreshes the global Bun `loci` package after installing the managed Rust binary, so `loci serve` and `loci open` do not keep using stale TypeScript fallback code during the transition.
- `loci update` now fails with actionable recovery guidance if the Bun wrapper refresh cannot complete: `bun remove -g loci && bun install -g github:thienhm/loci`.
- Dashboard project and ticket reads now handle local SQLite open edge cases more explicitly, keeping healthy registered projects visible and returning precise diagnostics for unavailable project databases.
- Ticket creation no longer treats a post-create registry summary refresh problem as a hard creation failure after the ticket has already been written.

### Changed

- CLI help and docs now separate `loci update` for tool installation from `loci upgrade` for project data and template migration.
- Release docs now call out the temporary two-layer update model: Rust release artifacts remain binary-only, while `loci update` also refreshes the Bun fallback layer until server distribution is redesigned.

### Notes

- No project data migration is required from 2.0.0 to 2.0.1.
- Existing 2.0.0 users should run `loci update`. If that command is unavailable or the wrapper refresh fails, run `bun remove -g loci && bun install -g github:thienhm/loci`, then run `loci update` again.
