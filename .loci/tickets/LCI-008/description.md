# Update ticket workflow in LOCI.md
Here are some points:
- update the Status Values section, with a flow
- Check for the current project in loci, never update others project ticket
- When starting a new ticket, guide the user to describe the ticket if needed -> update the description.md -> start brainstorm
- When starting to implement, ask the user if they need to work on a new git branch, or git worktree, or keep working on the current branch
- The agent should update it to the assignee field
- After implementing, move the ticket to in review, then ask the user to verify it. Never move a ticket to done if the user doesn't ask
- Add a new cli "loci update" for the existing projects. At this point, it will update the new LOCI.md
