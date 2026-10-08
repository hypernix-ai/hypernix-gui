// Keeps a release build on Windows from opening a console. The app does
// not ship for Windows, but the attribute costs nothing and keeps `cargo
// check` quiet for anyone who builds it there anyway.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    hypernix_gui_lib::run()
}
