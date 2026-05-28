# LCI-062 Summary

<!-- LOCI:SUMMARY:BEGIN -->
## Implementation Summary

Refreshed CLI help output for the Rust-primary workflow. Rust command descriptions now make workflow packet steps clearer and distinguish project-data upgrade from managed binary update. The TypeScript compatibility wrapper now delegates top-level --help to the managed Rust binary when available, avoiding the stale legacy TypeScript command list. Validation passed: focused Rust cli_help tests, focused TypeScript bridge tests, cargo fmt --check, full cargo workspace tests, root Bun tests, git diff --check, and affected help smoke checks. Evidence: EV-000001 through EV-000005. Trace: TR-000004.
<!-- LOCI:SUMMARY:END -->
