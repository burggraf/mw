// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod nats;

use std::sync::Arc;
use tauri::Manager;

/// Auto-start mode from command line
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AutoStartMode {
    None,
    Controller,
    Display,
}

fn init_tracing() {
    use tracing_subscriber::{fmt, prelude::*, EnvFilter};
    let fmt_layer = fmt::layer().with_target(false);
    let env_filter = EnvFilter::from_default_env()
        .add_directive(tracing::Level::DEBUG.into());
    tracing_subscriber::registry()
        .with(fmt_layer)
        .with(env_filter)
        .init();
}

fn parse_auto_start_mode() -> AutoStartMode {
    // Check environment variable first (more reliable with Tauri)
    if let Ok(mode) = std::env::var("MW_AUTO_MODE") {
        match mode.as_str() {
            "controller" => return AutoStartMode::Controller,
            "display" => return AutoStartMode::Display,
            _ => {}
        }
    }

    // Fall back to command-line args
    let args: Vec<String> = std::env::args().collect();
    for arg in args.iter() {
        match arg.as_str() {
            "--controller" => return AutoStartMode::Controller,
            "--display" => return AutoStartMode::Display,
            _ => {}
        }
    }
    AutoStartMode::None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tracing();

    let auto_start_mode = parse_auto_start_mode();
    if auto_start_mode != AutoStartMode::None {
        tracing::info!("Auto-start mode: {:?}", auto_start_mode);
    }

    // Initialize NATS client state
    let nats_state = nats::NatsState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(Arc::new(auto_start_mode))
        .manage(nats_state)
        .invoke_handler({
            #[cfg(not(target_os = "android"))]
            {
                tauri::generate_handler![
                    commands::get_auto_start_mode,
                    commands::cache_media,
                    commands::cache_media_from_buffer,
                    commands::get_cached_media,
                    commands::get_cached_media_data_url,
                    commands::clear_media_cache,
                    commands::get_cache_stats,
                    commands::test_emit_event,
                    commands::get_available_monitors,
                    commands::open_display_window,
                    commands::close_display_window,
                    commands::auto_start_display_windows,
                    commands::get_platform,
                    // NATS commands
                    commands::spawn_nats_server,
                    commands::discover_nats_cluster,
                    commands::advertise_nats_service,
                    commands::stop_nats_server,
                    commands::connect_nats_server,
                    commands::disconnect_nats_server,
                    commands::is_nats_connected,
                    commands::get_nats_server_url,
                    commands::publish_nats_lyrics,
                    commands::publish_nats_slide,
                ]
            }
            #[cfg(target_os = "android")]
            {
                tauri::generate_handler![
                    commands::get_auto_start_mode,
                    commands::cache_media,
                    commands::cache_media_from_buffer,
                    commands::get_cached_media,
                    commands::get_cached_media_data_url,
                    commands::clear_media_cache,
                    commands::get_cache_stats,
                    commands::test_emit_event,
                    commands::get_platform,
                    // NATS commands (client only on Android)
                    commands::discover_nats_cluster,
                    commands::advertise_nats_service,
                    commands::connect_nats_server,
                    commands::disconnect_nats_server,
                    commands::is_nats_connected,
                    commands::get_nats_server_url,
                    commands::publish_nats_lyrics,
                    commands::publish_nats_slide,
                ]
            }
        })
        .setup(|app| {
            // Trigger auto-start if mode is set
            let auto_start_mode = app.state::<Arc<AutoStartMode>>();
            let mode = **auto_start_mode.inner();
            if mode != AutoStartMode::None {
                commands::start_auto_test(app.handle().clone(), mode);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
