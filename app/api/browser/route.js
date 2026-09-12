import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ─── Constants ────────────────────────────────────────────────────────────────

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 20000;

// ─── SSRF Guard ───────────────────────────────────────────────────────────────

function isPrivateHost(hostname) {
  const host = (hostname || "").toLowerCase().replace(/[\[\]]/g, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    return true;
  const v4 = host.split(".");
  if (v4.length === 4) {
    const nums = v4.map(Number);
    if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = nums;
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  return false;
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

function dirHref(target) {
  let dir = target.pathname || "/";
  if (!dir.endsWith("/")) {
    const idx = dir.lastIndexOf("/");
    dir = idx >= 0 ? dir.slice(0, idx + 1) : "/";
  }
  return `${target.origin}${dir}`;
}

/**
 * Given a raw attribute value, resolve it to an absolute URL and wrap it
 * in the proxy. Returns the original string unchanged if it can't/shouldn't
 * be proxied.
 */
function proxifyUrl(raw, base, proxyBase) {
  if (!raw || typeof raw !== "string") return raw;
  const s = raw.trim();
  if (!s) return raw;
  // Pass through things that are definitely not proxiable URLs
  if (
    s.startsWith("data:") ||
    s.startsWith("blob:") ||
    s.startsWith("#") ||
    s.startsWith("mailto:") ||
    s.startsWith("tel:") ||
    s.startsWith("javascript:")
  )
    return raw;
  // Already proxied
  if (s.includes("/api/browser?url=")) return raw;
  try {
    const abs = new URL(s, base);
    if (!/^https?:$/.test(abs.protocol)) return raw;
    return proxyBase + encodeURIComponent(abs.href);
  } catch {
    return raw;
  }
}

// ─── CSS rewriting ────────────────────────────────────────────────────────────

function rewriteCss(css, base, proxyBase) {
  // url("..."), url('...'), url(...)
  css = css.replace(
    /url\(\s*(['"]?)\s*(.*?)\s*\1\s*\)/gi,
    (_, q, val) => `url(${q}${proxifyUrl(val, base, proxyBase)}${q})`
  );
  // @import "..." / @import '...'
  css = css.replace(
    /@import\s+(['"])(.*?)\1/gi,
    (_, q, val) => `@import ${q}${proxifyUrl(val, base, proxyBase)}${q}`
  );
  return css;
}

// ─── JS shim prepended to every proxied JS file ───────────────────────────────

function wrapJs(js, proxyBase) {
  // Only prepend if not already shimmed
  if (js.includes("__ANB_PROXY__")) return js;
  const shim = `;(function(){try{
var __ANB_PROXY__=${JSON.stringify(proxyBase)};
function __anb_w__(u){
  try{
    if(u==null)return u;
    var s=(u instanceof URL)?u.href:(u instanceof Request)?u.url:String(u);
    if(!s||/^(data:|blob:|javascript:|#)/.test(s))return u;
    if(s.indexOf(__ANB_PROXY__)===0||s.indexOf('/api/browser?url=')!==-1)return u;
    var abs=new URL(s,location.href).href;
    if(!/^https?:/.test(abs))return u;
    return __ANB_PROXY__+encodeURIComponent(abs);
  }catch(e){return u;}
}
(function(){
  var _xo=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    try{arguments[1]=__anb_w__(u);}catch(e){}
    return _xo.apply(this,arguments);
  };
})();
(function(){
  var _f=window.fetch;
  if(typeof _f==='function'){
    window.fetch=function(u,o){
      try{u=__anb_w__(u);}catch(e){}
      return _f.call(this,u,o);
    };
  }
})();
}catch(e){}})();
`;
  return shim + js;
}

// ─── HTML rewriting ───────────────────────────────────────────────────────────

/**
 * Walk the HTML string and rewrite resource-loading attributes.
 * Uses a simple tag-by-tag scan instead of fragile multi-attribute regexes.
 */
function rewriteHtmlAttributes(html, base, proxyBase) {
  // Process one attribute value at a time using a safe per-attr regex
  // Attributes that load external resources
  const RESOURCE_ATTRS = /\b(src|href|action|data-src|data-href|poster)\s*=\s*(['"])(.*?)\2/gi;

  // Replace resource-loading attrs in resource tags
  html = html.replace(
    /<(script|img|source|input|track|embed|object|video|audio|link|iframe|form|a)(\s[^>]*)?>/gi,
    (tagMatch) => {
      return tagMatch.replace(RESOURCE_ATTRS, (attrMatch, attr, q, val) => {
        // Don't rewrite <a> href if it looks like an anchor or non-http
        if (
          attr.toLowerCase() === "href" &&
          (val.startsWith("#") ||
            val.startsWith("mailto:") ||
            val.startsWith("tel:") ||
            val.startsWith("javascript:"))
        )
          return attrMatch;
        const rewritten = proxifyUrl(val, base, proxyBase);
        return `${attr}=${q}${rewritten}${q}`;
      });
    }
  );

  // Rewrite srcset values
  html = html.replace(/\bsrcset\s*=\s*(['"])(.*?)\1/gi, (_, q, value) => {
    const parts = value.split(",").map((part) => {
      const trimmed = part.trim();
      const spaceIdx = trimmed.search(/\s/);
      if (spaceIdx === -1) {
        return proxifyUrl(trimmed, base, proxyBase);
      }
      const url = trimmed.slice(0, spaceIdx);
      const descriptor = trimmed.slice(spaceIdx);
      return proxifyUrl(url, base, proxyBase) + descriptor;
    });
    return `srcset=${q}${parts.join(", ")}${q}`;
  });

  // Rewrite inline style attributes
  html = html.replace(/\bstyle\s*=\s*(['"])(.*?)\1/gi, (_, q, val) => {
    return `style=${q}${rewriteCss(val, base, proxyBase)}${q}`;
  });

  // Rewrite <style> blocks
  html = html.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_, open, content, close) => open + rewriteCss(content, base, proxyBase) + close
  );

  return html;
}

/**
 * Full HTML processing: inject the control script + rewrite static URLs.
 */
function processHtml(html, target, proxyBase) {
  if (html.includes("__ANONTWEET_BROWSER__")) return html;

  const base = target.href;
  const baseHref = dirHref(target);

  const script = buildInjectedScript(proxyBase, target);

  // Strip existing base tags and meta-refresh
  html = html.replace(/<base\b[^>]*>/gi, "");
  html = html.replace(
    /<meta[^>]*\bhttp-equiv\s*=\s*['"]?refresh['"]?[^>]*>/gi,
    ""
  );

  // Rewrite static asset URLs in the markup
  html = rewriteHtmlAttributes(html, base, proxyBase);

  const baseTag = `<base href="${baseHref.replace(/"/g, "&quot;")}">`;
  const injection = `${baseTag}<script>${script}</script>`;

  if (/<\/head\s*>/i.test(html)) {
    html = html.replace(/<\/head\s*>/i, `${injection}</head>`);
  } else if (/<body[\s>]/i.test(html)) {
    html = html.replace(/<body[\s>]/i, (m) => `${injection}${m}`);
  } else {
    html = injection + html;
  }

  return html;
}

/**
 * The injected script that runs inside every proxied page.
 * Handles: location shim, history.pushState, fetch/XHR intercept, link
 * clicks, form submits, window.open, MutationObserver title tracking.
 */
function buildInjectedScript(proxyBase, target) {
  return `(function(){
var PROXY=${JSON.stringify(proxyBase)};
var _rl;try{_rl=window.location;}catch(e){}

function isHttp(s){try{return /^https?:/.test(String(s));}catch(e){return false;}}
function proxied(s){
  try{var t=String(s);return t.indexOf('/api/browser?url=')!==-1||t.indexOf(PROXY)===0;}
  catch(e){return false;}
}
function base(){try{return document.baseURI||_rl.href;}catch(e){return '';}}
function wrap(u,fb){
  try{
    var s=String(u==null?'':u);
    if(!s||/^(data:|blob:|javascript:|#|mailto:|tel:)/.test(s))return null;
    if(proxied(s))return s;
    if(!isHttp(s)){s=new URL(s,fb||base()).href;}
    if(!isHttp(s))return null;
    return PROXY+encodeURIComponent(s);
  }catch(e){return null;}
}
function realUrl(){
  try{
    var h=_rl.href;
    var i=h.indexOf(PROXY);
    if(i===-1)return null;
    return decodeURIComponent(h.slice(i+PROXY.length));
  }catch(e){return null;}
}
function curReal(){return realUrl()||_rl.href;}

/* ── window.location shim ── */
var _ls={
  assign:function(u){var w=wrap(u);if(w)_rl.replace(w);},
  replace:function(u){var w=wrap(u);if(w)_rl.replace(w);},
  reload:function(){_rl.replace(PROXY+encodeURIComponent(curReal()));},
  toString:function(){return curReal();},
  valueOf:function(){return curReal();}
};
['origin','protocol','host','hostname','port','pathname','search','hash'].forEach(function(p){
  Object.defineProperty(_ls,p,{
    get:function(){try{var r=realUrl();return r?new URL(r)[p]:_rl[p];}catch(e){return _rl[p];}},
    configurable:true
  });
});
Object.defineProperty(_ls,'href',{
  get:function(){return curReal();},
  set:function(v){var w=wrap(v);if(w)_rl.replace(w);},
  configurable:true
});
try{
  Object.defineProperty(window,'location',{
    get:function(){return _ls;},
    set:function(v){var w=wrap(v);if(w)_rl.replace(w);},
    configurable:true
  });
}catch(e){}

/* ── history.pushState / replaceState ── */
function notify(url,title){
  try{window.parent.postMessage({__browser:{type:'nav',url:url||curReal(),title:title||document.title||''}},'*');}catch(e){}
}
try{
  var _hP=history.pushState.bind(history);
  var _hR=history.replaceState.bind(history);
  history.pushState=function(s,t,u){
    if(u!=null){var w=wrap(String(u),curReal());if(w)u=w;}
    _hP(s,t,u);
    notify(realUrl());
  };
  history.replaceState=function(s,t,u){
    if(u!=null){var w=wrap(String(u),curReal());if(w)u=w;}
    _hR(s,t,u);
    notify(realUrl());
  };
  window.addEventListener('popstate',function(){notify(realUrl());});
}catch(e){}

/* ── Title MutationObserver ── */
try{
  var _lt='';
  var _mo=new MutationObserver(function(){
    var t=document.title;if(t&&t!==_lt){_lt=t;notify(null,t);}
  });
  function _watchTitle(){
    var el=document.querySelector('title');
    if(el)_mo.observe(el,{childList:true,characterData:true,subtree:true});
    if(document.head)_mo.observe(document.head,{childList:true,subtree:false});
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_watchTitle);
  }else{_watchTitle();}
}catch(e){}

/* ── XHR intercept ── */
try{
  var _xo=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    try{var w=wrap(u);if(w)arguments[1]=w;}catch(e){}
    return _xo.apply(this,arguments);
  };
}catch(e){}

/* ── fetch intercept ── */
try{
  var _of=window.fetch;
  if(typeof _of==='function'){
    window.fetch=function(u,o){
      try{var w=wrap(u instanceof Request?u.url:u);if(w)u=w;}catch(e){}
      return _of.call(this,u,o);
    };
  }
}catch(e){}

/* ── sendBeacon intercept ── */
try{
  if(navigator.sendBeacon){
    var _sb=navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon=function(u,d){
      try{var w=wrap(u);if(w)u=w;}catch(e){}
      return _sb(u,d);
    };
  }
}catch(e){}

/* ── Link click intercept ── */
document.addEventListener('click',function(e){
  var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;
  if(!a)return;
  var href=a.getAttribute('href')||'';
  if(!href||/^(javascript:|mailto:|tel:|#)/.test(href))return;
  try{
    var abs=new URL(href,document.baseURI).href;
    if(proxied(abs)){e.preventDefault();_rl.replace(abs);return;}
    if(isHttp(abs)){e.preventDefault();_rl.replace(PROXY+encodeURIComponent(abs));}
  }catch(err){}
},true);

/* ── Form submit intercept ── */
document.addEventListener('submit',function(e){
  var f=e.target;if(!f||f.tagName!=='FORM')return;
  var action=f.getAttribute('action');
  var method=(f.getAttribute('method')||'get').toLowerCase();
  try{
    var dest=new URL(action||curReal(),document.baseURI);
    e.preventDefault();
    if(method==='post'){
      var fd=new FormData(f);
      var c=document.createElement('form');
      c.method='post';c.action=PROXY+encodeURIComponent(dest.href);
      fd.forEach(function(v,k){var i=document.createElement('input');i.type='hidden';i.name=k;i.value=v;c.appendChild(i);});
      document.body.appendChild(c);c.submit();
    }else{
      var fd2=new FormData(f);var p=new URLSearchParams();
      fd2.forEach(function(v,k){p.append(k,v);});
      dest.search=p.toString();
      _rl.replace(PROXY+encodeURIComponent(dest.href));
    }
  }catch(err){}
},true);

/* ── window.open → new tab ── */
try{
  window.open=function(u){
    try{
      if(u&&isHttp(String(u))&&!proxied(String(u))){
        window.parent.postMessage({__browser:{type:'newTab',url:String(u)}},'*');
      }
    }catch(e){}
    return null;
  };
}catch(e){}

/* ── Notify parent on page load ── */
window.addEventListener('load',function(){notify(null,document.title);});

/* ── Guard: if the page somehow navigated outside the proxy, pull it back ── */
try{
  var _gi=setInterval(function(){
    try{
      var h=_rl.href;
      if(h&&isHttp(h)&&!proxied(h)){
        clearInterval(_gi);
        _rl.replace(PROXY+encodeURIComponent(h));
      }
    }catch(e){}
  },600);
}catch(e){}

document.__ANONTWEET_BROWSER__=1;
})();`;
}

// ─── Cookie Jar ───────────────────────────────────────────────────────────────

function parseJar(raw) {
  try {
    const v = raw ? JSON.parse(decodeURIComponent(raw)) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function cookieHeader(jar, host) {
  const pairs = [];
  for (const [dom, map] of Object.entries(jar)) {
    if (!map || typeof map !== "object") continue;
    if (dom === host || host.endsWith("." + dom) || dom.endsWith("." + host)) {
      for (const [n, v] of Object.entries(map)) {
        if (v) pairs.push(`${n}=${v}`);
      }
    }
  }
  return pairs.join("; ");
}

function mergeCookieJar(jar, host, setCookieList) {
  const map = { ...(jar[host] && typeof jar[host] === "object" ? jar[host] : {}) };
  for (const raw of setCookieList || []) {
    const parts = String(raw).split(";").map((s) => s.trim());
    if (!parts.length) continue;
    const eq = parts[0].indexOf("=");
    if (eq <= 0) continue;
    const name = parts[0].slice(0, eq);
    const value = parts[0].slice(eq + 1);
    let dom = host;
    const dp = parts.find((p) => /^domain\s*=/i.test(p));
    if (dp) {
      const d = dp.replace(/^domain\s*=\s*/i, "").replace(/^\./, "").trim();
      if (d) dom = d;
    }
    const expired =
      parts.some((p) => /^max-age\s*=\s*0/i.test(p)) ||
      parts.some((p) => {
        const m = p.match(/^expires\s*=\s*(.+)/i);
        if (!m) return false;
        try { return new Date(m[1]) < new Date(); } catch { return false; }
      });
    const entry = jar[dom] && typeof jar[dom] === "object" ? { ...jar[dom] } : {};
    const target = dom === host ? map : entry;
    if (!value || expired) delete target[name];
    else target[name] = value;
    if (dom !== host) jar[dom] = entry;
  }
  jar[host] = map;
  return jar;
}

function capJar(jar) {
  const out = {};
  let budget = 4000;
  for (const [host, map] of Object.entries(jar)) {
    if (!map || typeof map !== "object") continue;
    const s = JSON.stringify(map);
    if (s.length > budget) continue;
    out[host] = map;
    budget -= s.length;
  }
  return out;
}

// ─── Upstream fetch ───────────────────────────────────────────────────────────

async function upstream(url, method, body, cookies, referer) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  const headers = {
    "User-Agent": BROWSER_UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    // Explicitly request identity encoding so we get plain text back
    "Accept-Encoding": "identity",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": method === "GET" ? "document" : "empty",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": referer ? "same-origin" : "none",
    "Sec-Ch-Ua": '"Chromium";v="125", "Not.A/Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
  };
  if (referer) headers["Referer"] = referer;
  if (cookies) headers["Cookie"] = cookies;
  if (method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: method === "POST" ? body : undefined,
      redirect: "follow",
      signal: ctrl.signal,
      // @ts-ignore — Node 18+ fetch option to skip decompression
      compress: false,
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── Response headers ─────────────────────────────────────────────────────────

function safeHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Cache-Control": "no-store",
    // Strip all framing restrictions; apply a permissive CSP for our proxy frame
    "Content-Security-Policy":
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
      "script-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
      "style-src * 'unsafe-inline' data:; " +
      "font-src * data: blob:; " +
      "img-src * data: blob:; " +
      "media-src * data: blob:; " +
      "connect-src *; frame-src *; worker-src * blob:;",
  };
}

// ─── Persist cookie jar ───────────────────────────────────────────────────────

function withJar(res, jar) {
  res.cookies.set("_anb_cookies", encodeURIComponent(JSON.stringify(jar)), {
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
    sameSite: "lax",
  });
  return res;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  return handle(request, searchParams.get("url"), "GET", null);
}

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const text = await request.text();
  return handle(request, searchParams.get("url"), "POST", text);
}

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("origin") || "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers":
        request.headers.get("access-control-request-headers") || "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}

async function handle(request, rawUrl, method, bodyText) {
  const { protocol, host } = request.nextUrl;
  const proxyBase = `${protocol}//${host}/api/browser?url=`;

  if (!rawUrl) {
    return html502(renderError("Missing ?url= parameter"), 400);
  }

  let target;
  try {
    target = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return html502(renderError("Invalid URL"), 400);
  }

  if (!/^https?:$/.test(target.protocol)) {
    return html502(renderError("Only http/https URLs are supported"), 400);
  }
  if (isPrivateHost(target.hostname)) {
    return html502(renderError("Private/local addresses are not accessible"), 403);
  }

  // Detect the referer from the Referer header (set by the browser when the
  // iframe loads a sub-resource)
  const referer = (() => {
    const r = request.headers.get("referer");
    if (!r) return null;
    try {
      const ru = new URL(r);
      const proxied = ru.searchParams.get("url");
      return proxied || null;
    } catch {
      return null;
    }
  })();

  const jar = parseJar(request.cookies.get("_anb_cookies")?.value);
  const cookieStr = cookieHeader(jar, target.host);

  let res;
  try {
    res = await upstream(target.href, method, bodyText, cookieStr, referer);
  } catch (err) {
    const msg =
      err?.name === "AbortError"
        ? "Page took too long to load (timeout)"
        : `Could not reach ${target.hostname}: ${err?.message || "network error"}`;
    return html502(renderError(msg), 502);
  }

  // Extract Set-Cookie and merge into jar
  let setCookies = [];
  if (typeof res.headers.getSetCookie === "function") {
    setCookies = res.headers.getSetCookie();
  } else {
    const sc = res.headers.get("set-cookie");
    if (sc) setCookies = [sc];
  }
  const mergedJar = capJar(mergeCookieJar(jar, target.host, setCookies));

  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const ct = contentType.toLowerCase();
  const isHtml = ct.includes("text/html");
  const isCss = ct.includes("text/css");
  const isJs = ct.includes("javascript") || ct.includes("ecmascript");

  if (isHtml) {
    const text = await res.text();
    const processed = processHtml(text, target, proxyBase);
    return withJar(
      new NextResponse(processed, { status: res.status, headers: safeHeaders(contentType) }),
      mergedJar
    );
  }

  if (isCss) {
    const text = await res.text();
    const processed = rewriteCss(text, target.href, proxyBase);
    return withJar(
      new NextResponse(processed, { status: res.status, headers: safeHeaders(contentType) }),
      mergedJar
    );
  }

  if (isJs) {
    const text = await res.text();
    const processed = wrapJs(text, proxyBase);
    return withJar(
      new NextResponse(processed, { status: res.status, headers: safeHeaders(contentType) }),
      mergedJar
    );
  }

  // Binary / other
  const buf = await res.arrayBuffer();
  return withJar(
    new NextResponse(new Uint8Array(buf), { status: res.status, headers: safeHeaders(contentType) }),
    mergedJar
  );
}

function html502(body, status = 502) {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ─── Error page ───────────────────────────────────────────────────────────────

function renderError(message) {
  const safe = String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0f0f0f;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.card{text-align:center;padding:40px 32px;max-width:460px;width:100%;background:#1a1a1a;border-radius:16px;border:1px solid #2a2a2a}
.icon{font-size:52px;margin-bottom:16px}
h1{font-size:18px;font-weight:600;margin-bottom:8px;color:#fff}
p{font-size:13px;color:#888;line-height:1.6;word-break:break-word}
.sub{margin-top:12px;font-size:11px;color:#555}
</style></head><body><div class="card">
<div class="icon">🌐</div>
<h1>Unable to load page</h1>
<p>${safe}</p>
<p class="sub">AnonTweet Browser · Try a different URL</p>
</div></body></html>`;
}
