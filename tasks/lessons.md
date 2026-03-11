# Lessons Learned

## 2026-03-11: Always read LOCI.md before interacting with Loci tickets

**Mistake**: Listed all tickets across all projects without reading `LOCI.md` first. `LOCI.md` explicitly says to only manage LCI tickets and never read other projects.

**Root Cause**: `GEMINI.md` had a soft reference ("See LOCI.md") that was treated as informational rather than a mandatory pre-step.

**Fix applied**: Updated `GEMINI.md` to inline the hard rules (project guard, always filter by project_id) and added a MANDATORY callout to read `LOCI.md` before any ticket interaction.

**Rule**: Before ANY Loci MCP call, read `LOCI.md`. Always pass `project_id` when listing tickets. Never show tickets from other projects.
