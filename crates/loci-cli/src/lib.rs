pub mod app;
pub mod commands;
pub mod db;
pub mod domain;
pub mod migrations;
pub mod packet;
pub mod paths;
pub mod project;
pub mod registry;
pub mod templates;

pub use app::run;
