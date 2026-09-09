use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent, Url, LogicalPosition, PhysicalSize,
};
use std::sync::{Arc, Mutex};

fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
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

struct ToastNotification {
    id: u32,
    title: String,
    body: String,
    url: String,
}

struct ToastState {
    counter: Mutex<u32>,
    active_toasts: Mutex<Vec<ToastNotification>>,
}

#[tauri::command]
fn show_toast(app: tauri::AppHandle, title: String, body: String, url: String) {
    let state: tauri::State<'_, Arc<ToastState>> = app.state();
    let id = {
        let mut counter = state.counter.lock().unwrap();
        *counter += 1;
        *counter
    };

    let toast = ToastNotification {
        id,
        title: title.clone(),
        body: body.clone(),
        url: url.clone(),
    };

    {
        let mut toasts = state.active_toasts.lock().unwrap();
        toasts.push(toast);
    }

    // Create toast window using custom URI scheme
    let app_handle = app.clone();
    let toast_url = format!("anontweet://toast/{id}?title={}&body={}&url={}", 
        urlencoding::encode(&title),
        urlencoding::encode(&body),
        urlencoding::encode(&url)
    );

    // Use tauri::WebviewWindowBuilder to create a new window
    let _ = tauri::WebviewWindowBuilder::new(
        &app_handle,
        format!("toast-{id}"),
        tauri::WebviewUrl::External(toast_url.parse().unwrap()),
    )
    .title("AnonTweet Notification")
    .inner_size(360.0, 100.0)
    .min_inner_size(360.0, 100.0)
    .max_inner_size(360.0, 100.0)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .visible(true)
    .build()
    .ok();

    // Position after window is created
    let win_label = format!("toast-{id}");
    if let Some(win) = app.get_webview_window(&win_label) {
        if let Some(monitor) = win.current_monitor().ok().flatten() {
            let monitor_size = monitor.size();
            let window_size = win.outer_size().ok().unwrap_or(PhysicalSize::new(360, 100));
            
            let x = monitor_size.width as f64 - window_size.width as f64 - 16.0;
            let y = monitor_size.height as f64 - window_size.height as f64 - 48.0;
            
            let _ = win.set_position(LogicalPosition::new(x, y));
        }
    }

    // Auto-close after 8 seconds
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
    let state: tauri::State<'_, Arc<ToastState>> = app.state();
    let toasts = state.active_toasts.lock().unwrap();
    if let Some(toast) = toasts.iter().find(|t| t.id == id) {
        if !toast.url.is_empty() {
            navigate_to_url(&app, &toast.url);
        }
    }
    // Close the toast after click
    let _ = app.get_webview_window(&format!("toast-{id}")).map(|w| w.close());
    let mut toasts = state.active_toasts.lock().unwrap();
    toasts.retain(|t| t.id != id);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .manage(Arc::new(ToastState {
            counter: Mutex::new(0),
            active_toasts: Mutex::new(Vec::new()),
        }))
        .register_uri_scheme_protocol("anontweet", move |_app, request| {
            let uri = request.uri();
            let uri_str = uri.to_string();
            if uri_str.starts_with("anontweet://toast/") {
                let query = uri_str.strip_prefix("anontweet://toast/").unwrap_or("");
                let parts: Vec<&str> = query.split('?').collect();
                let id = parts[0].parse::<u32>().unwrap_or(0);
                
                let params = parts.get(1).map_or("", |v| *v);
                let mut title = String::new();
                let mut body = String::new();
                let mut url_str = String::new();
                
                for pair in params.split('&') {
                    let kv: Vec<&str> = pair.split('=').collect();
                    if kv.len() == 2 {
                        let value = urlencoding::decode(kv[1]).unwrap_or_default().to_string();
                        match kv[0] {
                            "title" => title = value,
                            "body" => body = value,
                            "url" => url_str = value,
                            _ => {}
                        }
                    }
                }
                
                let html = format!(r#"
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1f1f1f; 
            color: #fff; 
            width: 360px; 
            height: 100px;
            border-radius: 12px;
            border: 1px solid #333;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            overflow: hidden;
        }}
        .toast {{ 
            padding: 12px 16px; 
            height: 100%; 
            display: flex; 
            flex-direction: column; 
            justify-content: center;
            cursor: pointer;
            user-select: none;
            -webkit-app-region: drag;
        }}
        .title {{ font-weight: 600; font-size: 14px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
        .body {{ font-size: 13px; color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
        .progress-bar {{ 
            position: absolute; 
            bottom: 0; 
            left: 0; 
            height: 3px; 
            background: #3b82f6; 
            animation: progress 8s linear forwards;
        }}
        @keyframes progress {{ from {{ width: 100%; }} to {{ width: 0%; }} }}
        .close-btn {{
            position: absolute;
            top: 8px;
            right: 8px;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: rgba(255,255,255,0.1);
            border: none;
            color: #888;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            -webkit-app-region: no-drag;
        }}
        .close-btn:hover {{ background: rgba(255,255,255,0.2); color: #fff; }}
    </style>
</head>
<body>
    <div class="toast" onclick="window.__TAURI__.invoke('handle_toast_click', {{id: {id}}})">
        <button class="close-btn" onclick="event.stopPropagation(); window.__TAURI__.invoke('close_toast', {{id: {id}}})">×</button>
        <div class="title">{title}</div>
        <div class="body">{body}</div>
        <div class="progress-bar"></div>
    </div>
    <script>
    </script>
</body>
</html>
"#);
                
                tauri::http::Response::builder()
                    .header("Content-Type", "text/html")
                    .body(html.into_bytes())
                    .unwrap()
            } else {
                tauri::http::Response::builder()
                    .status(404)
                    .body(b"Not found".to_vec())
                    .unwrap()
            }
        })
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