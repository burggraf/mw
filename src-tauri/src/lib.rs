// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod webrtc;

use commands::WebrtcState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(WebrtcState::new())
        .invoke_handler(tauri::generate_handler![
            commands::start_peer,
            commands::send_control_message,
            commands::get_connected_peers,
            commands::get_leader_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
