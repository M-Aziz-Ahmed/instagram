use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent, Url, WebviewUrl,
};
use std::sync::{Arc, Mutex};

fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn show_notification(app: &tauri::AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();
}

fn navigate_to_url(app: &tauri::AppHandle, url_str: &str) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        if let Ok(url) = url_str.parse::<Url>() {
            let _ = win.navigate(url);
        }
    }
}

struct NotificationState {
    pending_url: Mutex<Option<String>>,
}

#[tauri::command]
fn notify(app: tauri::AppHandle, title: String, body: String, url: String, _tag: String) {
    let state: tauri::State<'_, Arc<NotificationState>> = app.state();
    if !url.is_empty() {
        *state.pending_url.lock().unwrap() = Some(url.clone());
    }
    show_notification(&app, &title, &body);
}

#[tauri::command]
fn handle_notification_click(app: tauri::AppHandle) {
    let state: tauri::State<'_, Arc<NotificationState>> = app.state();
    let url_opt = state.pending_url.lock().unwrap().take();
    if let Some(url) = url_opt {
        navigate_to_url(&app, &url);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .manage(Arc::new(NotificationState {
            pending_url: Mutex::new(None),
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
                        // Discord-style: single left click reopens the window.
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // Listen for window focus to handle notification clicks
            if let Some(win) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                let _ = win.on_window_event(move |event| {
                    if let WindowEvent::Focused(focused) = event {
                        if *focused {
                            let state: tauri::State<'_, Arc<NotificationState>> = app_handle.state();
                            let url_opt = state.pending_url.lock().unwrap().take();
                            if let Some(url) = url_opt {
                                if let Some(win) = app_handle.get_webview_window("main") {
                                    if let Ok(nav_url) = url.parse::<Url>() {
                                        let _ = win.navigate(nav_url);
                                    }
                                }
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Hide into the tray instead of quitting (Discord behavior).
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![notify, handle_notification_click])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}