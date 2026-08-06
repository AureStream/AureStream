// Hide the host console on Windows (dev + release). Sidecar still uses
// CREATE_NO_WINDOW when spawned; without this, `tauri dev` shows a console and
// every core spawn can flash black terminals.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    aurestream_lib::run()
}
