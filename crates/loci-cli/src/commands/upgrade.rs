use anyhow::Result;

use crate::upgrade;

pub fn run(dry_run: bool, json: bool) -> Result<()> {
    let report = if dry_run {
        upgrade::plan(true)?
    } else {
        upgrade::apply()?
    };

    if json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print_human_report(&report);
    }

    Ok(())
}

fn print_human_report(report: &upgrade::UpgradeReport) {
    let created = report.count_status("create");
    let updated = report.count_status("update");
    let unchanged = report.count_status("unchanged");
    let conflicts = report.count_status("conflict");

    if report.dry_run {
        println!(
            "Upgrade dry-run: created {created}, updated {updated}, unchanged {unchanged}, conflicts {conflicts}"
        );
    } else {
        println!(
            "Upgrade complete: created {created}, updated {updated}, unchanged {unchanged}, conflicts {conflicts}"
        );
    }
}
