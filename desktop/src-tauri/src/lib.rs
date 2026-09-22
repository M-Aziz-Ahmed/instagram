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

// ─── Learning: native TTS + speech recognition ────────────────────────────────
// The education sub-app needs pronunciation everywhere. WebView2 knows few
// voices and has no speech-recognition API, so the desktop client bridges to
// Windows' System.Speech through PowerShell:
//   native_tts        — speak "text" in "lang" (best matching installed voice)
//   recognize_speech  — listen for the expected phrase, return { text, conf }
// Payloads travel as UTF-8 base64 JSON so no quoting can break on any script.

fn b64_encode(input: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).map(|b| *b as u32).unwrap_or(0);
        let b2 = chunk.get(2).map(|b| *b as u32).unwrap_or(0);
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

fn ps_encode(src: &str) -> String {
    // PowerShell -EncodedCommand expects UTF-16LE, base64.
    let mut bytes: Vec<u8> = Vec::with_capacity(src.len() * 2);
    for u in src.encode_utf16() {
        bytes.extend_from_slice(&u.to_le_bytes());
    }
    b64_encode(&bytes)
}

fn run_powershell(script: &str) -> Result<String, String> {
    if std::env::consts::OS != "windows" {
        return Err("native speech requires Windows".into());
    }
    let encoded = ps_encode(script);
    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &encoded]);
    // The Tauri app is a GUI process: without this flag a new console window
    // flashes on every TTS click. CREATE_NO_WINDOW runs PowerShell invisible.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
    if !out.status.success() {
        return Err(format!(
            "powershell exit {}: {}",
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(stdout)
}

fn ps_payload_b64(json: &serde_json::Value) -> String {
    b64_encode(&json.to_string().into_bytes())
}

fn ps_decode_line(out: &str, marker: &str) -> String {
    for line in out.lines() {
        if let Some(rest) = line.strip_prefix(marker) {
            return rest.trim().to_string();
        }
    }
    String::new()
}

const PS_HEAD: &str = r#"
$ErrorActionPreference = "SilentlyContinue"
$p = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"#;

const PS_MID: &str = r#"')) | ConvertFrom-Json
"#;

fn build_tts_script(payload: &serde_json::Value) -> String {
    let mut s = String::with_capacity(1024);
    s.push_str(PS_HEAD);
    s.push_str(&ps_payload_b64(payload));
    s.push_str(PS_MID);
    s.push_str(r#"
try {
  Add-Type -AssemblyName System.Speech
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $base = (($(if ($null -eq $p.lang) { "" } else { $p.lang })) -split '-')[0].ToLower()
  if ($base) {
    foreach ($v in $synth.GetInstalledVoices()) {
      $c = $v.VoiceInfo.Culture
      if ($c -and $c.Name.ToLower().StartsWith($base)) { $synth.SelectVoice($v.VoiceInfo.Name); break }
    }
  }
  $synth.Rate = 0
  $synth.Speak([string]$p.text)
  "OK"
} catch { "ERR:" + $_.Exception.Message }
"#);
    s
}

fn build_recognize_script(payload: &serde_json::Value) -> String {
    let mut s = String::with_capacity(2048);
    s.push_str(PS_HEAD);
    s.push_str(&ps_payload_b64(payload));
    s.push_str(PS_MID);
    s.push_str(r#"
try {
  Add-Type -AssemblyName System.Speech
  $engine = $null
  $base = (($(if ($null -eq $p.lang) { "" } else { $p.lang })) -split '-')[0]
  if ($base) {
    try { $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($base) } catch { $engine = $null }
  }
  if (-not $engine) { try { $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine } catch {} }
  if (-not $engine) { "UNSUPPORTED"; exit }

  $phrase = [string]$p.expect
  $gb = New-Object System.Speech.Recognition.GrammarBuilder
  $choice = New-Object System.Speech.Recognition.Choices
  if ($phrase) { $choice.Add($phrase) }
  foreach ($w in ($phrase -split ' ')) { if ($w) { $choice.Add($w) } }
  $gb.Append($choice)
  $grammar = New-Object System.Speech.Recognition.Grammar($gb)
  $engine.LoadGrammar($grammar)
  $engine.SetInputToDefaultAudioDevice()
  $timeout = [int]$(if ($p.timeoutMs) { $p.timeoutMs } else { 8000 })
  $result = $engine.Recognize([TimeSpan]::FromMilliseconds($timeout))
  if ($result) {
    "RESULT::$($result.Text)|$($result.Confidence)"
  } else {
    "EMPTY::"
  }
} catch { "ERR:" + $_.Exception.Message }
"#);
    s
}

#[tauri::command]
async fn native_tts(text: String, lang: String) -> Result<bool, String> {
    let payload = serde_json::json!({ "text": text, "lang": lang });
    let script = build_tts_script(&payload);
    let out = tauri::async_runtime::spawn_blocking(move || run_powershell(&script))
        .await
        .map_err(|e| e.to_string())??;
    Ok(out.trim().starts_with("OK"))
}

#[tauri::command]
async fn recognize_speech(expect: String, lang: String, timeout_ms: Option<u32>) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "expect": expect, "lang": lang, "timeoutMs": timeout_ms.unwrap_or(8000) });
    let script = build_recognize_script(&payload);
    let out = tauri::async_runtime::spawn_blocking(move || run_powershell(&script))
        .await
        .map_err(|e| e.to_string())??;
    if out.contains("UNSUPPORTED") {
        return Ok(serde_json::json!({ "error": "unsupported" }));
    }
    let result = ps_decode_line(&out, "RESULT::");
    if result.is_empty() {
        return Ok(serde_json::json!({ "text": "" }));
    }
    if let Some((text, conf)) = result.split_once('|') {
        return Ok(serde_json::json!({ "text": text, "confidence": conf.parse::<f64>().unwrap_or(0.0) }));
    }
    Ok(serde_json::json!({ "error": "unexpected" }))
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
            native_tts, recognize_speech,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
