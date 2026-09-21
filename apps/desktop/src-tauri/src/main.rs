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
// Preferred port; if another app already holds it, pick a free one instead (see pick_api_port).
const API_PREFERRED_PORT: u16 = 4000;
// Neither of these is sensitive — a public API host and a public campaign id, same as what's
// already visible on clipping.net itself — so no env!() indirection needed for these two.
const API_CLIPPING_API_URL: &str = "https://clipping.net";
const API_CLIPPING_CAMPAIGN_ID: &str = "6825752777a6ce103f6bdba0";

struct ApiSidecar(std::sync::Mutex<Option<CommandChild>>);
struct ApiPort(u16);

// The sidecar listens on 0.0.0.0, so probe that same address — a 127.0.0.1-only probe can succeed
// while another app's wildcard listener still owns the port.
fn port_is_free(port: u16) -> bool {
    std::net::TcpListener::bind(("0.0.0.0", port)).is_ok()
}

// Port 4000 is popular with other dev tools; if it is taken, let the OS hand out a free one
// rather than leaving the backend dead. The webview learns the choice via the `api_url` command.
fn pick_api_port() -> u16 {
    if port_is_free(API_PREFERRED_PORT) {
        return API_PREFERRED_PORT;
    }
    std::net::TcpListener::bind(("0.0.0.0", 0))
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(API_PREFERRED_PORT)
}

#[tauri::command]
fn api_url(port: tauri::State<'_, ApiPort>) -> String {
    format!("http://localhost:{}", port.0)
}

fn spawn_api_sidecar(app: &tauri::AppHandle, port: u16) {
    let resource_dir = match app.path().resource_dir() {
        Ok(dir) => dir,
        Err(_) => return,
    };
    let server_path = resource_dir.join("api").join("server.cjs");
    let server_path_str = match server_path.to_str() {
        Some(s) => s.to_string(),
        None => return,
    };

    // A GUI-launched background process's cwd defaults to "/" on macOS (there's no shell to
    // inherit a sensible one from) — apps/api's ClippingBrowserManager resolves its session
    // storage relative to cwd, which meant every CLIPPING login failed trying to mkdir
    // "/.clipping-sessions" (no permission). app_data_dir() is a real, writable, per-app
    // location that exists specifically for this.
    let data_dir = app.path().app_data_dir().ok();
    if let Some(dir) = &data_dir {
        let _ = std::fs::create_dir_all(dir);
    }

    let command = match app.shell().sidecar("api-node") {
        Ok(cmd) => cmd,
        Err(_) => return,
    };
    let mut command = command
        .args([server_path_str])
        .env("DATABASE_URL", API_DATABASE_URL)
        .env("SUPABASE_URL", API_SUPABASE_URL)
        .env("PORT", port.to_string())
        .env("CORS_ORIGIN", "tauri://localhost")
        .env("CLIPPING_API_URL", API_CLIPPING_API_URL)
        .env("CLIPPING_CAMPAIGN_ID", API_CLIPPING_CAMPAIGN_ID)
        .env("NODE_ENV", "production");
    if let Some(dir) = data_dir.as_ref().and_then(|d| d.to_str()) {
        command = command.env("RIPPLELINK_DATA_DIR", dir);
    }

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
        .manage(ApiPort(pick_api_port()))
        .invoke_handler(tauri::generate_handler![api_url])
        .setup(|app| {
            let port = app.state::<ApiPort>().0;
            spawn_api_sidecar(&app.handle(), port);
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
