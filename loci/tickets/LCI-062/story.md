# LCI-062 Update CLI --help output

## Intent

Refresh the CLI help output so users can understand the current Rust-primary Loci workflow directly from `--help`.

## Scope

- Review top-level `loci --help` output for stale, confusing, or missing command descriptions.
- Review command-level help for the commands affected by the Rust CLI cutover, especially `add`, `shape`, `plan`, `ready`, `validate`, `evidence`, `review`, `upgrade`, and `update`.
- Clarify the distinction between project-data operations and tool-update operations, especially `loci upgrade` versus `loci update`.
- Keep compatibility-wrapper help aligned where it still exposes CLI help.
- Update only help text and directly related CLI metadata unless a behavior change is required to make the help truthful.

## Out of Scope

- Redesigning command behavior.
- Adding new CLI commands.
- Changing persistence, ticket workflow states, or dashboard behavior.

## Context Links

- `./target/debug/loci --help`
- `loci --help`
- Prior release verification included both Rust CLI and compatibility-wrapper help checks.

## Acceptance Criteria

- Top-level `loci --help` presents clear descriptions for primary commands.
- Affected command-level `--help` screens reflect current command semantics.
- Rust CLI and compatibility-wrapper help output do not contradict each other.
- Validation evidence records the exact help commands run, including `./target/debug/loci --help` and any affected command-level help screens.

## Risk Lane

normal
