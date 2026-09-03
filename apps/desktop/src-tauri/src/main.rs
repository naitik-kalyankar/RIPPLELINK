// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

// Every RIPPLELINK install needs apps/api running somewhere it can reach — this is what makes
// that automatic instead of asking a non-technical user to install Node, clone a repo, and run
// a terminal command. The bundled Node binary (binaries/api-node, see tauri.conf.json's
// externalBin) runs the pre-built server (resources/api/server.cjs) as a background sidecar,
// started here and killed when the app closes.
//
// DATABASE_URL is baked in at COMPILE time via env!() (see .github/workflows/release.yml's
// RIPPLELINK_DATABASE_URL secret, or export it yourself for a local build) — never written into
// this source file, since the repo is public and git history is forever. It's intentionally NOT
// the project's full-access postgres superuser — it's a separate, restricted `app_client` role
// (no auth schema access, can't create/drop anything, can't touch other databases). Real
// per-user data isolation still comes from apps/api's existing code, which scopes every query by
// the verified JWT's userId — same as it always has. This credential is still extractable from
// the compiled .app bundle by anyone who has it, same as any embedded secret in a distributed
// client; the restricted role exists specifically to shrink what that exposure could ever mean,
// not to pretend it can't happen.
const API_DATABASE_URL: &str = env!("RIPPLELINK_DATABASE_URL");
const API_SUPABASE_URL: &str = "https://bpguykfkavdlzywwbbiq.supabase.co";
const API_PORT: &str = "4000";

struct ApiSidecar(std::sync::Mutex<Option<CommandChild>>);

fn spawn_api_sidecar(app: &tauri::AppHandle) {
    let resource_dir = match app.path().resource_dir() {
        Ok(dir) => dir,
        Err(_) => return,
    };
    let server_path = resource_dir.join("api").join("server.cjs");
    let server_path_str = match server_path.to_str() {
        Some(s) => s.to_string(),
        None => return,
    };

    let command = match app.shell().sidecar("api-node") {
        Ok(cmd) => cmd,
        Err(_) => return,
    };
    let command = command
        .args([server_path_str])
        .env("DATABASE_URL", API_DATABASE_URL)
        .env("SUPABASE_URL", API_SUPABASE_URL)
        .env("PORT", API_PORT)
        .env("CORS_ORIGIN", "tauri://localhost")
        .env("NODE_ENV", "production");

    if let Ok((_rx, child)) = command.spawn() {
        if let Some(state) = app.try_state::<ApiSidecar>() {
            *state.0.lock().unwrap() = Some(child);
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ApiSidecar(std::sync::Mutex::new(None)))
        .setup(|app| {
            spawn_api_sidecar(&app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building RIPPLELINK desktop shell")
        .run(|app_handle, event| {
            // Per-window Destroyed didn't reliably fire on quit (Cmd+Q / Dock quit) — the
            // sidecar kept running and holding port 4000 even after the app closed. Exit is the
            // whole-application-is-shutting-down signal, which does fire consistently.
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<ApiSidecar>() {
                    if let Some(child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
