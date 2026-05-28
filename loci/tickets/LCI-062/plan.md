# LCI-062 Plan

## Implementation Steps

- [x] Capture baseline Rust CLI help output for top-level and affected command-level screens.
- [x] Capture compatibility-wrapper help output and compare it with Rust CLI behavior.
- [x] Inspect Rust CLI command definitions and bridge help behavior to identify stale or contradictory text.
- [x] Update help text and command metadata only, avoiding behavior changes unless required for truthful help.
- [x] Add or update focused tests where practical for changed help semantics.
- [x] Run focused validation, help smoke checks, and record evidence plus trace entries before review.
