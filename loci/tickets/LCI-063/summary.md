# LCI-063 Summary

<!-- LOCI:SUMMARY:BEGIN -->
## Implementation Summary

Fixed the false failure path behind duplicate ticket creation. The root cause was that project-local mutations committed successfully, then registry summary refresh errors were propagated as command failures. The fix keeps pre-commit add failures atomic, but treats post-commit registry count refresh as best-effort: add/status/validate now emit a warning if the derived registry summary cannot be refreshed. Added a regression test that breaks the global registry path and proves loci add still returns JSON success with exactly one ticket row and story file. Validation passed: focused regression, workflow packet suite, registry summary suite, cargo fmt --check, full cargo workspace tests, git diff --check, and isolated smoke checks for both target/debug/loci and the installed wrapper delegation path.
<!-- LOCI:SUMMARY:END -->
