use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Url, WebviewUrl, WindowEvent,
};
use std::sync::{Arc, Mutex};

fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn navigate_to_url(app: &tauri::AppHandle, url_str: &str) {
    if url_str.is_empty() {
        return;
    }
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        // Resolve relative URLs (e.g. "/inbox") against the main window's origin.
        let target: Option<Url> = (|| {
            if let Ok(base) = win.url() {
                if let Ok(u) = Url::options().base_url(Some(&base)).parse(url_str) {
                    return Some(u);
                }
            }
            url_str.parse::<Url>().ok()
        })();
        if let Some(u) = target {
            let _ = win.navigate(u);
        }
    }
}

struct ToastNotification {
    id: u32,
    url: String,
}

struct ToastState {
    counter: Mutex<u32>,
    active_toasts: Mutex<Vec<ToastNotification>>,
}

#[tauri::command]
fn show_toast(app: tauri::AppHandle, title: String, body: String, url: String) -> Result<(), String> {
    let id = {
        let state: tauri::State<'_, Arc<ToastState>> = app.state();
        let mut counter = state.counter.lock().unwrap();
        *counter += 1;
        *counter
    };

    {
        let state: tauri::State<'_, Arc<ToastState>> = app.state();
        let mut toasts = state.active_toasts.lock().unwrap();
        toasts.push(ToastNotification { id, url: url.clone() });
    }

    // Load the toast from the bundled app asset (app origin → IPC available).
    let win_label = format!("toast-{id}");
    let data = serde_json::json!({ "id": id, "title": title, "body": body });
    let init_script = format!("window.__TOAST_DATA__ = {};", data);

    let win = tauri::WebviewWindowBuilder::new(&app, &win_label, WebviewUrl::App("toast.html".into()))
        .title("AnonTweet Notification")
        .inner_size(360.0, 100.0)
        .min_inner_size(360.0, 100.0)
        .max_inner_size(360.0, 100.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .initialization_script(&init_script)
        .build()
        .map_err(|e| e.to_string())?;

    // Position bottom-right on the primary monitor.
    if let Some(monitor) = app.primary_monitor().ok().flatten() {
        let monitor_size = monitor.size();
        let window_size = win.outer_size().ok().unwrap_or(Default::default());
        let x = monitor_size.width.saturating_sub(window_size.width).saturating_sub(16) as f64;
        let y = monitor_size.height.saturating_sub(window_size.height).saturating_sub(48) as f64;
        let _ = win.set_position(tauri::LogicalPosition::new(x, y));
    }

    // Auto-close after 8 seconds.
    let app_handle_clone = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(8));
        if let Some(win) = app_handle_clone.get_webview_window(&win_label) {
            let _ = win.close();
        }
        let state: tauri::State<'_, Arc<ToastState>> = app_handle_clone.state();
        let mut toasts = state.active_toasts.lock().unwrap();
        toasts.retain(|t| t.id != id);
    });

    Ok(())
}

#[tauri::command]
fn close_toast(app: tauri::AppHandle, id: u32) {
    if let Some(win) = app.get_webview_window(&format!("toast-{id}")) {
        let _ = win.close();
    }
    let state: tauri::State<'_, Arc<ToastState>> = app.state();
    let mut toasts = state.active_toasts.lock().unwrap();
    toasts.retain(|t| t.id != id);
}

#[tauri::command]
fn handle_toast_click(app: tauri::AppHandle, id: u32) {
    let url = {
        let state: tauri::State<'_, Arc<ToastState>> = app.state();
        let toasts = state.active_toasts.lock().unwrap();
        toasts.iter().find(|t| t.id == id).map(|t| t.url.clone())
    };
    if let Some(u) = url {
        navigate_to_url(&app, &u);
    }
    let _ = app.get_webview_window(&format!("toast-{id}")).map(|w| w.close());
    let state: tauri::State<'_, Arc<ToastState>> = app.state();
    let mut toasts = state.active_toasts.lock().unwrap();
    toasts.retain(|t| t.id != id);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(Arc::new(ToastState {
            counter: Mutex::new(0),
            active_toasts: Mutex::new(Vec::new()),
        }))
        .setup(|app| {
            #[cfg(desktop)]
            {
                let _ = app
                    .handle()
                    .plugin(tauri_plugin_updater::Builder::new().build());
            }

            let show_i = MenuItem::with_id(app, "show", "Show AnonTweet", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().cloned().expect("missing app icon"))
                .tooltip("AnonTweet")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![show_toast, close_toast, handle_toast_click])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}