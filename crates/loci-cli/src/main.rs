fn main() {
    if let Err(error) = loci_cli::run() {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}
