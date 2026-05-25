use std::collections::HashSet;

use crate::packet;

pub fn declared_commands(
    project_validation: Option<&str>,
    ticket_validation: Option<&str>,
) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut commands = Vec::new();

    for document in [project_validation, ticket_validation]
        .into_iter()
        .flatten()
    {
        for command in packet::open_checklist_items_in_section(document, "Validation Commands") {
            if seen.insert(command.clone()) {
                commands.push(command);
            }
        }
    }

    commands
}
