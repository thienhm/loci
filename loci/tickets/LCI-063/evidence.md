# LCI-063 Evidence

<!-- LOCI:EVIDENCE:BEGIN -->
## Evidence Index

- `EV-000006` [command] Regression test reproduces post-create registry refresh failure - passing
  - Summary: The test first failed because loci add returned an error from the post-create registry refresh after the ticket row and story were created; it now passes with a warning and one created ticket.
- `EV-000007` [command] Focused Rust workflow packet suite - passing
  - Summary: All workflow packet tests pass after changing registry refresh handling.
- `EV-000008` [command] Registry summary refresh suite - passing
  - Summary: Existing registry count behavior still passes when the registry is healthy.
- `EV-000009` [command] Rust formatting and workspace validation - passing
  - Summary: Rust formatting, full workspace tests, and whitespace diff checks pass.
- `EV-000010` [command] Rust binary add smoke with broken registry - passing
  - Summary: In an isolated workspace, target/debug/loci add returned JSON success, emitted a registry warning on stderr, and list showed one created ticket.
- `EV-000011` [command] Installed wrapper add smoke with broken registry - passing
  - Summary: In an isolated workspace with the current built Rust binary installed at HOME/.loci/bin/loci, the installed loci wrapper delegated add successfully, emitted a registry warning, and list showed one created ticket.
<!-- LOCI:EVIDENCE:END -->


