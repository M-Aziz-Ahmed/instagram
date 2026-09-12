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
    if url_str.is_empty() { return; }
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        let target: Option<Url> = (|| {
            if let Ok(base) = win.url() {
                if let Ok(u) = Url::options().base_url(Some(&base)).parse(url_str) {
                    return Some(u);
                }
            }
            url_str.parse::<Url>().ok()
        })();
        if let Some(u) = target { let _ = win.navigate(u); }
    }
}

// ─── Toast state ──────────────────────────────────────────────────────────────

struct ToastNotification { id: u32, url: String }

struct ToastState {
    counter: Mutex<u32>,
    active_toasts: Mutex<Vec<ToastNotification>>,
}

// ─── Browser state ────────────────────────────────────────────────────────────

struct BrowserState {
    counter: Mutex<u32>,
    /// Label of the currently open inline browser overlay window, if any.
    active_label: Mutex<Option<String>>,
}

// ─── Toast commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn show_toast(app: tauri::AppHandle, title: String, body: String, url: String) -> Result<(), String> {
    let id = {
        let state: tauri::State<'_, Arc<ToastState>> = app.state();
        let mut counter = state.counter.lock().unwrap();
        *counter += 1;
        *counter
    };
    { let state: tauri::State<'_, Arc<ToastState>> = app.state(); let mut toasts = state.active_toasts.lock().unwrap(); toasts.push(ToastNotification { id, url: url.clone() }); }

    let win_label = format!("toast-{id}");
    let data = serde_json::json!({ "id": id, "title": title, "body": body });
    let init_script = format!("window.__TOAST_DATA__ = {};", data);

    let win = tauri::WebviewWindowBuilder::new(&app, &win_label, WebviewUrl::App("toast.html".into()))
        .title("AnonTweet Notification")
        .inner_size(360.0, 100.0).min_inner_size(360.0, 100.0).max_inner_size(360.0, 100.0)
        .resizable(false).decorations(false).always_on_top(true).skip_taskbar(true).focused(false)
        .initialization_script(&init_script)
        .build().map_err(|e| e.to_string())?;

    if let Some(monitor) = app.primary_monitor().ok().flatten() {
        let ms = monitor.size();
        let ws = win.outer_size().ok().unwrap_or_default();
        let x = ms.width.saturating_sub(ws.width).saturating_sub(16) as f64;
        let y = ms.height.saturating_sub(ws.height).saturating_sub(48) as f64;
        let _ = win.set_position(tauri::LogicalPosition::new(x, y));
    }

    let app2 = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(8));
        if let Some(w) = app2.get_webview_window(&win_label) { let _ = w.close(); }
        let state: tauri::State<'_, Arc<ToastState>> = app2.state();
        let mut toasts = state.active_toasts.lock().unwrap();
        toasts.retain(|t| t.id != id);
    });
    Ok(())
}

#[tauri::command]
fn close_toast(app: tauri::AppHandle, id: u32) {
    if let Some(win) = app.get_webview_window(&format!("toast-{id}")) { let _ = win.close(); }
    let state: tauri::State<'_, Arc<ToastState>> = app.state();
    state.active_toasts.lock().unwrap().retain(|t| t.id != id);
}

#[tauri::command]
fn handle_toast_click(app: tauri::AppHandle, id: u32) {
    let url = { let state: tauri::State<'_, Arc<ToastState>> = app.state(); let toasts = state.active_toasts.lock().unwrap(); toasts.iter().find(|t| t.id == id).map(|t| t.url.clone()) };
    if let Some(u) = url { navigate_to_url(&app, &u); }
    let _ = app.get_webview_window(&format!("toast-{id}")).map(|w| w.close());
    let state: tauri::State<'_, Arc<ToastState>> = app.state();
    state.active_toasts.lock().unwrap().retain(|t| t.id != id);
}

// ─── Browser commands ─────────────────────────────────────────────────────────

/// Create (or replace) an overlay browser window positioned at absolute screen
/// coordinates (physical pixels).
#[tauri::command]
fn browser_open(
    app: tauri::AppHandle,
    url: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let screen_x = x;
    let screen_y = y;
    // Close any existing browser overlay first.
    {
        let bs: tauri::State<'_, Arc<BrowserState>> = app.state();
        let old = bs.active_label.lock().unwrap().take();
        drop(bs);
        if let Some(old_label) = old {
            if let Some(w) = app.get_webview_window(&old_label) { let _ = w.close(); }
        }
    }

    let target_url = url.parse::<Url>().map_err(|e| e.to_string())?;
    let label = {
        let bs: tauri::State<'_, Arc<BrowserState>> = app.state();
        let mut c = bs.counter.lock().unwrap();
        *c += 1;
        format!("browser-inline-{}", *c)
    };

    // Build a decoration-less window at the exact position of the content area.
    let win = tauri::WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(target_url))
        .title("AnonTweet Browser")
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .shadow(false)
        .focused(true)
        .inner_size(800.0, 600.0) // temporary size — repositioned immediately after
        .build()
        .map_err(|e| format!("browser window build failed: {}", e))?;

    // Position precisely using physical pixels (accounts for DPI scaling).
    let _ = win.set_position(tauri::PhysicalPosition::new(screen_x, screen_y));
    let _ = win.set_size(tauri::PhysicalSize::new(width, height));
    let _ = win.set_focus();

    let bs: tauri::State<'_, Arc<BrowserState>> = app.state();
    *bs.active_label.lock().unwrap() = Some(label.clone());
    Ok(label)
}

/// Navigate the active inline browser window to a new URL.
#[tauri::command]
fn browser_navigate(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let bs: tauri::State<'_, Arc<BrowserState>> = app.state();
    let label = bs.active_label.lock().unwrap().clone().ok_or("no active browser")?;
    let win = app.get_webview_window(&label).ok_or("browser window not found")?;
    let u = url.parse::<Url>().map_err(|e| e.to_string())?;
    win.navigate(u).map_err(|e| e.to_string())
}

/// Reposition and resize the active inline browser window (physical pixels).
#[tauri::command]
fn browser_set_bounds(
    app: tauri::AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let bs: tauri::State<'_, Arc<BrowserState>> = app.state();
    let label = match bs.active_label.lock().unwrap().clone() { Some(l) => l, None => return Ok(()) };
    let win = match app.get_webview_window(&label) { Some(w) => w, None => return Ok(()) };
    let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
    let _ = win.set_size(tauri::PhysicalSize::new(width, height));
    Ok(())
}

/// Close the active inline browser window.
#[tauri::command]
fn browser_close(app: tauri::AppHandle) -> Result<(), String> {
    let bs: tauri::State<'_, Arc<BrowserState>> = app.state();
    let label = match bs.active_label.lock().unwrap().take() { Some(l) => l, None => return Ok(()) };
    if let Some(win) = app.get_webview_window(&label) { let _ = win.close(); }
    Ok(())
}

/// Returns the main window's inner-area top-left in physical pixels + scale factor.
#[tauri::command]
fn get_window_inner_pos(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let win = app.get_webview_window("main").ok_or("main window not found")?;
    let pos = win.inner_position().map_err(|e| e.to_string())?;
    let scale = win.scale_factor().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "x": pos.x, "y": pos.y, "scaleFactor": scale }))
}

// ─── App entry ────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(Arc::new(ToastState { counter: Mutex::new(0), active_toasts: Mutex::new(Vec::new()) }))
        .manage(Arc::new(BrowserState { counter: Mutex::new(0), active_label: Mutex::new(None) }))
        .setup(|app| {
            #[cfg(desktop)] { let _ = app.handle().plugin(tauri_plugin_updater::Builder::new().build()); }

            let show_i = MenuItem::with_id(app, "show", "Show AnonTweet", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().cloned().expect("missing app icon"))
                .tooltip("AnonTweet")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() { "show" => show_main(app), "quit" => app.exit(0), _ => {} })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
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
        .invoke_handler(tauri::generate_handler![
            show_toast, close_toast, handle_toast_click,
            get_window_inner_pos,
            browser_open, browser_navigate, browser_set_bounds, browser_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
