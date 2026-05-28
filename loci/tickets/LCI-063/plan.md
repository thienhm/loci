# LCI-063 Plan

## Implementation Steps

- [x] Reproduce or simulate the post-create failure that returns an error after the ticket row and story file exist.
- [x] Add a focused regression test that fails when registry summary refresh failure makes loci add report a failed create.
- [x] Change loci add so project ticket creation remains atomic for pre-commit failures and post-commit registry refresh failures are diagnosable without making add fail.
- [x] Run focused Rust workflow packet tests, formatting, workspace tests, and diff checks.
- [x] Record evidence, trace, summary, and move LCI-063 to in_review after proof gates pass.
