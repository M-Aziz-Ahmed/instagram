use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, Url, WebviewUrl, WindowEvent,
};
use std::sync::{Arc, Mutex};

// ─── Embedded Next server ─────────────────────────────────────────────────────
//
// The installer carries a standalone Next build plus a Node runtime, staged by
// tools/prepare-desktop.mjs. The UI is served from loopback; the /api and /sio
// traffic it proxies onward to the shared live server behaves exactly as it does
// for the web build, so nothing about the backend changes.
const SIDECAR_PORT: u16 = 3210;

struct SidecarState {
    child: Mutex<Option<std::process::Child>>,
    /// Windows only. Holding this handle for the lifetime of the app is what keeps
    /// the sidecar alive; the OS reaps it the moment the handle closes.
    #[cfg(windows)]
    job: Mutex<Option<std::os::windows::io::OwnedHandle>>,
}

/// Put the sidecar in a Job Object flagged kill-on-close.
///
/// Without this, force-quitting the app from Task Manager leaves the server running
/// and still holding the port, so the next launch silently serves the previous
/// build. A Job Object makes the kernel clean up on any exit path, crash included.
/// Failure is not fatal: the explicit kill in stop_sidecar still covers a clean quit.
#[cfg(windows)]
fn attach_kill_on_close(child: &std::process::Child) -> Option<std::os::windows::io::OwnedHandle> {
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    unsafe {
        let raw = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if raw.is_null() {
            return None;
        }
        let job = OwnedHandle::from_raw_handle(raw as HANDLE);

        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = SetInformationJobObject(
            raw,
            JobObjectExtendedLimitInformation,
            std::ptr::addr_of!(info).cast(),
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if ok == 0 {
            CloseHandle(raw);
            return None;
        }

        if AssignProcessToJobObject(raw, child.as_raw_handle() as HANDLE) == 0 {
            // Fails if the app is already inside a job that forbids nesting. Give up
            // quietly and rely on the normal shutdown path.
            CloseHandle(raw);
            return None;
        }
        Some(job)
    }
}

/// Tauri's resource_dir comes back as a Windows verbatim path (`\\?\D:\...`).
/// Node cannot resolve one: realpathSync strips the prefix, ends up with the bare
/// drive `D:`, and aborts with EISDIR before the script is ever loaded. Windows
/// APIs understand the prefix but most child processes do not, so it is removed
/// before the path is handed to Node.
fn strip_verbatim(path: std::path::PathBuf) -> std::path::PathBuf {
    #[cfg(windows)]
    {
        if let Some(text) = path.to_str() {
            if let Some(rest) = text.strip_prefix(r"\\?\") {
                // A verbatim UNC path is \\?\UNC\server\share; the plain form is \\server\share.
                return match rest.strip_prefix(r"UNC\") {
                    Some(unc) => std::path::PathBuf::from(format!(r"\\{unc}")),
                    None => std::path::PathBuf::from(rest),
                };
            }
        }
    }
    path
}

/// Locate a bundled resource. Verified layout is a flat copy under the resource
/// dir; some bundlers nest resources one level deeper by target triple, so that is
/// kept as a fallback rather than assumed.
fn resolve_resource(app: &tauri::AppHandle, rel: &str) -> Option<std::path::PathBuf> {
    let base = strip_verbatim(app.path().resource_dir().ok()?);
    let flat = base.join(rel);
    if flat.exists() {
        return Some(flat);
    }
    let arch = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    };
    let os = match std::env::consts::OS {
        "windows" => "win",
        "macos" => "darwin",
        other => other,
    };
    let nested = base.join(format!("{arch}-{os}")).join(rel);
    if nested.exists() {
        return Some(nested);
    }
    None
}

/// Ask the sidecar for `/` and report whether it answered with something other
/// than a server error.
///
/// A bare `TcpStream::connect` is not a readiness signal on its own. It returns
/// true the moment the socket is bound, which is *before* Next has compiled and
/// mounted its routes — and the first real request is then the one paying for
/// every chunk read, config parse and route mount. On a cold first launch that
/// is seconds, and it is precisely when the user is staring at the window.
fn probe_once(port: u16) -> bool {
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(1500)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(1500)));

    let request = format!(
        "GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\nUser-Agent: anontweet-sidecar-probe\r\nAccept: */*\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    // Only the status line is needed. `Connection: close` means the server ends
    // the body and closes, so a bounded read is enough and cannot hang.
    let mut head = [0u8; 64];
    let Ok(n) = stream.read(&mut head) else {
        return false;
    };
    let head = String::from_utf8_lossy(&head[..n]);
    let mut parts = head.split_whitespace();
    let version_ok = matches!(parts.next(), Some("HTTP/1.1" | "HTTP/1.0"));
    let served = parts
        .next()
        .and_then(|code| code.parse::<u16>().ok())
        .is_some_and(|code| (200..500).contains(&code));
    version_ok && served
}

/// Poll `probe_once` until the sidecar serves `/`, or the timeout expires.
fn wait_until_serving(port: u16, timeout: std::time::Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        if probe_once(port) {
            return true;
        }
        if std::time::Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
}

/// Where the UI is served from when the bundled server cannot be started. Falling
/// back keeps the app usable instead of showing a dead window.
const REMOTE_FALLBACK_URL: &str = "https://anontweet.vercel.app";

/// Open the sidecar's log file, or null if it cannot be created. Never fatal —
/// losing the log is preferable to refusing to start.
fn log_file(app: &tauri::AppHandle) -> std::process::Stdio {
    use std::io::Write;
    use std::process::Stdio;

    let Ok(dir) = app.path().app_log_dir() else {
        return Stdio::null();
    };
    if std::fs::create_dir_all(&dir).is_err() {
        return Stdio::null();
    }
    let path = dir.join("sidecar.log");
    match std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        Ok(mut file) => {
            // Mark each launch so the tail is attributable when several sessions
            // are interleaved in one file.
            let _ = writeln!(file, "\n=== launch {} ===", log_stamp());
            Stdio::from(file)
        }
        Err(_) => Stdio::null(),
    }
}

/// Timestamp for the log separator. Kept dependency-free and coarse: it only has
/// to be unique enough to tell launches apart in a text file.
fn log_stamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    secs.to_string()
}

fn spawn_sidecar(app: &tauri::AppHandle) -> bool {
    let (Some(node), Some(server)) = (
        resolve_resource(app, "bin/node.exe"),
        resolve_resource(app, "app/server.js"),
    ) else {
        eprintln!(
            "sidecar assets missing; run `node tools/prepare-desktop.mjs` before building the app"
        );
        return false;
    };

    let mut cmd = std::process::Command::new(&node);
    cmd.arg(&server)
        .current_dir(server.parent().unwrap_or(&server))
        // 127.0.0.1 keeps the UI server off the network; nothing but this app's own
        // webview should be able to reach it.
        .env("PORT", SIDECAR_PORT.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .stdin(std::process::Stdio::null())
        // stderr goes to a log file rather than /dev/null. A sidecar that fails to
        // boot used to be indistinguishable from one that is merely slow, and the
        // only symptom was a localhost error page with nothing to diagnose it from.
        .stderr(log_file(app));

    // Without this the child would flash a console window on every launch.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.spawn() {
        Ok(child) => {
            #[cfg(windows)]
            let job = attach_kill_on_close(&child);
            let started = wait_until_serving(SIDECAR_PORT, std::time::Duration::from_secs(45));
            let state: tauri::State<'_, Arc<SidecarState>> = app.state();
            *state.child.lock().unwrap() = Some(child);
            #[cfg(windows)]
            {
                *state.job.lock().unwrap() = job;
            }
            started
        }
        Err(e) => {
            eprintln!("failed to spawn sidecar: {e}");
            false
        }
    }
}

/// Point the window at `target` and reveal it, retrying a few times.
///
/// The window's configured URL is now the bundled `index.html` placeholder rather
/// than the loopback address. That matters: Tauri builds config windows *before*
/// `setup()` runs, and WebView2 issues its first navigation synchronously at
/// webview creation, so any URL in the config pointing at a port nothing is
/// listening on yet is guaranteed to render a connection-refused page before a
/// single line of our code executes. There is no way to fix that ordering from
/// here, so the config now names a local asset that always loads and this
/// function does the real navigation once there is a server to navigate to.
///
/// `reload()` is deliberately not used for the first navigation: the webview is
/// sitting on the local placeholder, so `navigate` is a genuine cross-document
/// navigation rather than a re-request for the URL that already failed. That
/// distinction was the difference between "loads by itself" and "needs a manual
/// hard reload" on first open.
fn load_target(app: &tauri::AppHandle, target: &str) {
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    let Ok(url) = Url::parse(target) else {
        eprintln!("could not parse target url: {target}");
        return;
    };

    let mut attempts = 0;
    loop {
        match win.navigate(url.clone()) {
            Ok(()) => break,
            Err(e) => {
                attempts += 1;
                // A navigation can fail for transient reasons (the webview is
                // still settling the placeholder, the profile is being set up).
                // Bounded retries, then give up rather than spin.
                if attempts >= 5 {
                    eprintln!("navigation to {target} failed after {attempts} attempts: {e}");
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(600));
            }
        }
    }

    let _ = win.show();
    let _ = win.set_focus();
}

/// Start the bundled server off the main thread, then point the window at it.
fn start_sidecar(app: &tauri::AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        let local = spawn_sidecar(&handle);
        let target = if local {
            format!("http://127.0.0.1:{SIDECAR_PORT}")
        } else {
            eprintln!("sidecar unavailable; falling back to {REMOTE_FALLBACK_URL}");
            REMOTE_FALLBACK_URL.to_string()
        };
        load_target(&handle, &target);
    });
}

fn stop_sidecar(app: &tauri::AppHandle) {
    // Clone the Arc out of the state, and bind the child to its own statement, so
    // neither the State guard nor the MutexGuard is alive when the process handle
    // is moved out.
    let inner = app.state::<Arc<SidecarState>>().inner().clone();
    let taken = inner.child.lock().unwrap().take();
    if let Some(mut child) = taken {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// Quit the app from the tray. The reused external-URL overlay window can make
/// WebView2 teardown hang, so we first point it at a local blank page, request
/// a normal exit, and keep a watchdog that force-exits if teardown stalls.
fn quit_app(app: &tauri::AppHandle) {
    stop_sidecar(app);
    let bs: tauri::State<'_, Arc<BrowserState>> = app.state();
    if let Some(label) = bs.active_label.lock().unwrap().clone() {
        if let Some(w) = app.get_webview_window(&label) {
            let _ = w.hide();
            let _ = w.navigate("about:blank".parse::<Url>().unwrap_or_else(|_| Url::parse("about:blank").unwrap()));
        }
    }
    app.clone().exit(0);
    // Backstop: if the event loop can't finish tearing down the webviews,
    // hard-exit a moment later so the app never becomes unquittable.
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_secs(4));
        std::process::exit(0);
    });
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

struct ToastNotification { id: u32, title: String, body: String, url: String }

struct ToastState {
    counter: Mutex<u32>,
    active_toasts: Mutex<Vec<ToastNotification>>,
}

// ─── Browser state ────────────────────────────────────────────────────────────

struct BrowserState {
    counter: Mutex<u32>,
    /// Label of the inline browser overlay window. Created lazily on first use,
    /// then REUSED (hide/show + navigate). Destroying and recreating a WebView2
    /// window on every navigation is what crashed the app and left orphaned
    /// "AnonTweet Browser" processes/windows in Task Manager.
    active_label: Mutex<Option<String>>,
}

// ─── Toast commands ───────────────────────────────────────────────────────────

/// Cap on simultaneously visible toast windows. A burst of notifications used
/// to open one always-on-top window per call, with no queue and no dedupe, so a
/// misbehaving producer (e.g. an ad creative re-arming on a timer) could stack
/// an unbounded number of windows on top of the user's screen.
const MAX_VISIBLE_TOASTS: usize = 3;

/// How close two toasts must be in content to count as a duplicate. Bursts
/// repeat the same message, so this collapses them instead of stacking them.
fn toast_is_duplicate(existing: &[ToastNotification], title: &str, body: &str) -> bool {
    existing.iter().any(|t| t.title == title && t.body == body)
}

#[tauri::command]
fn show_toast(app: tauri::AppHandle, title: String, body: String, url: String) -> Result<(), String> {
    // Collapse an identical toast that is already on screen.
    {
        let state: tauri::State<'_, Arc<ToastState>> = app.state();
        let toasts = state.active_toasts.lock().unwrap();
        if toast_is_duplicate(&toasts, &title, &body) { return Ok(()); }
    }

    let id = {
        let state: tauri::State<'_, Arc<ToastState>> = app.state();
        let mut counter = state.counter.lock().unwrap();
        *counter += 1;
        *counter
    };

    let win_label = format!("toast-{id}");
    let data = serde_json::json!({ "id": id, "title": title, "body": body });
    let init_script = format!("window.__TOAST_DATA__ = {};", data);

    let win = tauri::WebviewWindowBuilder::new(&app, &win_label, WebviewUrl::App("toast.html".into()))
        .title("AnonTweet Notification")
        .inner_size(360.0, 100.0).min_inner_size(360.0, 100.0).max_inner_size(360.0, 100.0)
        .resizable(false).decorations(false).always_on_top(true).skip_taskbar(true).focused(false)
        .initialization_script(&init_script)
        .build().map_err(|e| e.to_string())?;

    {
        let state: tauri::State<'_, Arc<ToastState>> = app.state();
        let mut toasts = state.active_toasts.lock().unwrap();
        toasts.push(ToastNotification { id, title: title.clone(), body: body.clone(), url: url.clone() });
        // Over the cap: retire the oldest so the stack stays bounded.
        while toasts.len() > MAX_VISIBLE_TOASTS {
            let oldest = toasts.remove(0);
            if let Some(w) = app.get_webview_window(&format!("toast-{}", oldest.id)) {
                let _ = w.close();
            }
        }
    }

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

/// Create (or reuse) the inline browser overlay window positioned at absolute
/// screen coordinates (physical pixels). The window is created once and then
/// merely hidden/re-shown, repositioned and re-navigated — never destroyed
/// while the app runs.
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
    let target_url = url.parse::<Url>().map_err(|e| e.to_string())?;

    // Determine the persistent label (create only once).
    let label = {
        let bs: tauri::State<'_, Arc<BrowserState>> = app.state();
        let mut labels = bs.active_label.lock().unwrap();
        if let Some(l) = labels.as_ref() {
            l.clone()
        } else {
            let mut counter = bs.counter.lock().unwrap();
            *counter += 1;
            let l = format!("browser-inline-{}", *counter);
            labels.replace(l.clone());
            l
        }
    };

    let win = match app.get_webview_window(&label) {
        Some(w) => w,
        None => {
            // First time — build the borderless overlay window.
            tauri::WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(target_url.clone()))
                .title("AnonTweet Browser")
                .decorations(false)
                .resizable(false)
                .skip_taskbar(true)
                .shadow(false)
                .inner_size(800.0, 600.0) // temporary size — repositioned immediately after
                .build()
                .map_err(|e| format!("browser window build failed: {}", e))?
        }
    };

    // Reposition precisely using physical pixels (accounts for DPI scaling).
    let _ = win.hide();
    let _ = win.set_position(tauri::PhysicalPosition::new(screen_x, screen_y));
    let _ = win.set_size(tauri::PhysicalSize::new(width, height));
    if win.url().map(|u| u.as_str() != target_url.as_str()).unwrap_or(true) {
        let _ = win.navigate(target_url);
    }
    let _ = win.show();
    let _ = win.set_focus();
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

/// Hide the inline browser overlay. The window is kept alive (reused on the
/// next browser_open) so nothing is destroyed and no process lingers.
#[tauri::command]
fn browser_close(app: tauri::AppHandle) -> Result<(), String> {
    let bs: tauri::State<'_, Arc<BrowserState>> = app.state();
    let label = match bs.active_label.lock().unwrap().clone() { Some(l) => l, None => return Ok(()) };
    if let Some(win) = app.get_webview_window(&label) { let _ = win.hide(); }
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
    // -Sta: System.Speech synth/recognition engines run on an STA thread;
    // defaulting to STA for the spawned PowerShell avoids intermittent
    // "engine not initialized" failures that come back as silent TTS.
    cmd.args(["-NoProfile", "-Sta", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &encoded]);
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

// Same engine as build_tts_script, but instead of speaking to the default
// audio device it renders the phrase to a WAV buffer and emits the base64
// bytes. The front end takes those bytes and plays them through the exact
// same same-origin <audio>/relay pipeline used by every other TTS tier — so
// Windows' real installed voices get consistent "ended" timing and WebView2
// actually hears them (its audio element can't mix with PowerShell speaking
// out of band).
fn build_tts_wav_script(payload: &serde_json::Value) -> String {
    let mut s = String::with_capacity(2048);
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
  $stream = New-Object System.IO.MemoryStream
  $synth.SetOutputToWaveStream($stream)
  $synth.Speak([string]$p.text)
  $synth.SetOutputToNull()
  [Convert]::ToBase64String($stream.ToArray())
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

  # Build a *sequence* grammar, not a flat choice list.
  #
  # The old grammar put the whole sentence and each individual word into one Choices
  # set appended once, so every alternative was a single atomic token. A learner
  # speaking a sentence almost never gets the whole clause into one recognition
  # window - they pause, or the engine latches onto a fragment - and then nothing
  # in the grammar matched, so nothing came back and the attempt looked ignored.
  # Repeating a one-word rule lets any prefix, suffix or subset of the phrase be
  # recognised, and the caller's fuzzy matcher decides whether it was close enough.
  $words = @($phrase -split '\s+' | Where-Object { $_ })
  $engine.SetInputToDefaultAudioDevice()

  if ($words.Count -eq 0) {
    # Nothing recognisable to build from; fall back to free-form dictation.
    $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  } else {
    $any = New-Object System.Speech.Recognition.Choices
    foreach ($w in $words) { $any.Add($w) }

    # Append(count, min, max) repeats the rule, so any 1..N run of the allowed words
    # is a valid utterance. Verified this overload exists - GrammarBuilder has no
    # SetRepetition method, and calling one threw.
    $maxRepeat = [Math]::Min($words.Count + 4, 25)
    $seq = New-Object System.Speech.Recognition.GrammarBuilder
    $seq.Append($any, 1, $maxRepeat)
    try { $engine.LoadGrammar((New-Object System.Speech.Recognition.Grammar($seq))) } catch {}

    # A dictation grammar alongside matters for accented speech: the constrained
    # grammar can reject an otherwise clear attempt at a word the learner pronounces
    # differently, and returning nothing is worse than returning a guess the caller
    # can fuzzy-match or discard on confidence.
    try { $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar)) } catch {}
  }

  $timeout = [int]$(if ($p.timeoutMs) { $p.timeoutMs } else { 8000 })
  $sb = New-Object System.Text.StringBuilder
  $seen = 0
  $best = $null
  $deadline = (Get-Date).AddMilliseconds($timeout)
  while ((Get-Date) -lt $deadline) {
    $remaining = $deadline - (Get-Date)
    if ($remaining.TotalMilliseconds -lt 200) { break }
    $r = $engine.Recognize([TimeSpan]::FromMilliseconds([Math]::Min(1200, $remaining.TotalMilliseconds)))
    if (-not $r) { continue }
    $text = ([string]$r.Text).Trim()
    if (-not $text) { continue }
    $seen++
    if ($best -eq $null -or $r.Confidence -gt $best.Confidence) { $best = $r }
    # Keep listening for a short tail so a sentence can be picked up as more than
    # one fragment, but only while the learner is still producing words.
    if ($seen -ge 1 -and $sb.Length -gt 0) { [void]$sb.Append(' ') }
    [void]$sb.Append($text)
    if ($sb.Length -gt 240) { break }
  }

  if ($sb.Length -gt 0) {
    "RESULT::$($sb.ToString().Trim())|$(if ($best) { $best.Confidence } else { 0 })"
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
async fn tts_to_wav(text: String, lang: String) -> Result<Option<String>, String> {
    let payload = serde_json::json!({ "text": text, "lang": lang });
    let script = build_tts_wav_script(&payload);
    let out = tauri::async_runtime::spawn_blocking(move || run_powershell(&script))
        .await
        .map_err(|e| e.to_string())??;
    let trimmed = out.trim();
    if trimmed.is_empty() || trimmed.starts_with("ERR:") || trimmed.starts_with("ERR") {
        return Ok(None);
    }
    Ok(Some(trimmed.to_string()))
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
        .manage(Arc::new(SidecarState {
            child: Mutex::new(None),
            #[cfg(windows)]
            job: Mutex::new(None),
        }))
        .setup(|app| {
            #[cfg(desktop)] { let _ = app.handle().plugin(tauri_plugin_updater::Builder::new().build()); }

            // The window's configured URL is a local placeholder asset, so nothing
            // is loading until we say so. Both build flavours therefore go through
            // the same path: decide on a target, then navigate.
            //
            // Debug builds prefer a `next dev` on :3000 if one is already running,
            // which is the only thing `tauri dev` is good for. `devUrl` is null in
            // the config precisely because it could not be relied on — an explicit
            // window URL overrides it, so it was dead config that misdescribed what
            // the window loads. Probing :3000 first also means a debug build no
            // longer shows a connection-refused page when no dev server is up.
            if cfg!(debug_assertions) && probe_once(3000) {
                let handle = app.handle().clone();
                std::thread::spawn(move || load_target(&handle, "http://localhost:3000"));
            } else {
                start_sidecar(app.handle());
            }

            let show_i = MenuItem::with_id(app, "show", "Show AnonTweet", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().cloned().expect("missing app icon"))
                .tooltip("AnonTweet")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() { "show" => show_main(app), "quit" => quit_app(app), _ => {} })
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
                    // Hide any open inline browser overlay so it never lingers
                    // on the desktop (or in Task Manager) once the app hides
                    // to the tray.
                    let app = window.app_handle();
                    let bs: tauri::State<'_, Arc<BrowserState>> = app.state();
                    if let Some(label) = bs.active_label.lock().unwrap().clone() {
                        if let Some(w) = app.get_webview_window(&label) { let _ = w.hide(); }
                    }
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            show_toast, close_toast, handle_toast_click,
            get_window_inner_pos,
            browser_open, browser_navigate, browser_set_bounds, browser_close,
            native_tts, tts_to_wav, recognize_speech,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|awn, event| {
            // Hard-exit once the loop is done so WebView2 teardown can never
            // freeze the app and make Quit appear broken. (Windows close
            // first; if that itself stalls, quit_app's watchdog force-exits.)
            if let RunEvent::Exit = event {
                // The child would otherwise outlive us and hold port 3210, which
                // makes the next launch fail to bind.
                stop_sidecar(awn);
                std::process::exit(0);
            }
        });
}
