import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ─── Constants ────────────────────────────────────────────────────────────────

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 25000;

// Headers from upstream we must never forward to the client (security / correctness)
const BLOCKED_RESPONSE_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "x-content-type-options", // we set our own
  "strict-transport-security",
  "expect-ct",
  "permissions-policy",
  "report-to",
  "nel",
  "transfer-encoding", // managed by fetch/Node
  "connection",
  "keep-alive",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "set-cookie", // handled separately
]);

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

function baseTagHref(target) {
  let dir = target.pathname || "/";
  if (!dir.endsWith("/")) {
    const idx = dir.lastIndexOf("/");
    dir = idx >= 0 ? dir.slice(0, idx + 1) : "/";
  }
  return `${target.origin}${dir}`;
}

/** Rewrite a single URL value so it goes through the proxy. */
function proxifyUrl(raw, base, proxyBase) {
  if (!raw || typeof raw !== "string") return raw;
  const s = raw.trim();
  if (!s || s.startsWith("data:") || s.startsWith("blob:") || s.startsWith("#")) return raw;
  if (s.startsWith("javascript:")) return "javascript:void(0)";
  try {
    const abs = new URL(s, base);
    if (!/^https?:$/.test(abs.protocol)) return raw;
    return proxyBase + encodeURIComponent(abs.href);
  } catch {
    return raw;
  }
}

// ─── CSS rewriting ────────────────────────────────────────────────────────────

/**
 * Rewrite url(...) references and @import "..." inside a CSS string.
 * Only rewrites absolute or root-relative http(s) URLs.
 */
function rewriteCss(css, base, proxyBase) {
  // url( ... )
  css = css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, quote, value) => {
    const rewritten = proxifyUrl(value, base, proxyBase);
    return `url(${quote}${rewritten}${quote})`;
  });
  // @import "..." or @import '...'
  css = css.replace(/@import\s+(['"])(.*?)\1/gi, (match, quote, value) => {
    const rewritten = proxifyUrl(value, base, proxyBase);
    return `@import ${quote}${rewritten}${quote}`;
  });
  // @import url(...) — already handled above by url() pass
  return css;
}

// ─── JavaScript rewriting ─────────────────────────────────────────────────────

/**
 * Light-touch JS rewriting: we only wrap fetch/XHR/WebSocket here in the
 * server response so that scripts loaded as sub-resources also get the proxy.
 * The heavy lifting (location override, link intercept) is in the HTML injected
 * script. We prepend a small shim.
 */
function wrapJs(js, proxyBase) {
  const shim = `(function(){
var __ANB_PROXY__=${JSON.stringify(proxyBase)};
function __anb_wrap__(u,base){
  try{
    if(u==null||typeof u==='undefined')return u;
    var s=(u instanceof URL)?u.href:String(u);
    if(!s||/^(data:|blob:|javascript:|#)/.test(s))return u;
    if(s.indexOf(__ANB_PROXY__)===0||s.indexOf('/api/browser?url=')!==-1)return u;
    var abs=(typeof base==='string')?new URL(s,base).href:new URL(s).href;
    if(!/^https?:/.test(abs))return u;
    return __ANB_PROXY__+encodeURIComponent(abs);
  }catch(e){return u;}
}
try{var __anb_oXHR__=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u,a,usr,pw){return __anb_oXHR__.call(this,m,__anb_wrap__(u,location.href),a,usr,pw);};}catch(e){}
try{var __anb_oFetch__=window.fetch;window.fetch=function(u,o){try{u=__anb_wrap__(u,location.href);}catch(e){}return __anb_oFetch__.call(this,u,o);};}catch(e){}
try{var __anb_oWS__=window.WebSocket;window.WebSocket=function(u,p){try{u=__anb_wrap__(u,location.href);}catch(e){}return p===undefined?new __anb_oWS__(u):new __anb_oWS__(u,p);}; window.WebSocket.prototype=__anb_oWS__.prototype;}catch(e){}
})();
`;
  return shim + js;
}

// ─── HTML rewriting ───────────────────────────────────────────────────────────

/**
 * Rewrite all src/href/action/srcset/data-src attributes in HTML so that
 * external resources are loaded through the proxy.
 * Also rewrites inline style url() references and <style> blocks.
 */
function rewriteHtmlAttributes(html, base, proxyBase) {
  // Rewrite src and href and action attributes for tags that load resources
  html = html.replace(
    /(<(?:script|img|source|input|track|embed|object|video|audio|link|iframe)[^>]*?\s)(?:src|href|action|data-src|data-href)\s*=\s*(['"])(.*?)\2/gi,
    (match, prefix, quote, value) => {
      const attr = match.slice(prefix.length).split("=")[0].toLowerCase();
      const rewritten = proxifyUrl(value, base, proxyBase);
      return `${prefix}${attr}=${quote}${rewritten}${quote}`;
    }
  );

  // Rewrite srcset attributes
  html = html.replace(/\bsrcset\s*=\s*(['"])(.*?)\1/gi, (match, quote, value) => {
    const rewritten = value.replace(/([^,\s]+)(\s+\S+)?/g, (part, url, descriptor) => {
      return proxifyUrl(url, base, proxyBase) + (descriptor || "");
    });
    return `srcset=${quote}${rewritten}${quote}`;
  });

  // Rewrite <form action="..."> (method independent)
  html = html.replace(/(<form[^>]*?\s)action\s*=\s*(['"])(.*?)\2/gi, (match, prefix, quote, value) => {
    const rewritten = proxifyUrl(value, base, proxyBase);
    return `${prefix}action=${quote}${rewritten}${quote}`;
  });

  // Rewrite inline style="...url(...)..."
  html = html.replace(/\bstyle\s*=\s*(['"])(.*?)\1/gi, (match, quote, value) => {
    const rewritten = rewriteCss(value, base, proxyBase);
    return `style=${quote}${rewritten}${quote}`;
  });

  // Rewrite <style> blocks
  html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (match, open, content, close) => {
    return open + rewriteCss(content, base, proxyBase) + close;
  });

  return html;
}

/**
 * Inject the browser control script AND rewrite static asset URLs in the HTML.
 */
function processHtml(html, target, proxyBase) {
  if (html.includes("__ANONTWEET_BROWSER__")) return html;

  const base = target.href;
  const baseHref = baseTagHref(target);

  // ── The injected script ─────────────────────────────────────────────────
  const script = `(function(){
var PROXY=${JSON.stringify(proxyBase)};
var ORIGIN=${JSON.stringify(target.origin)};
function isHttp(s){try{return /^https?:/.test(String(s))}catch(e){return false}}
function isProxied(s){try{var t=String(s);return t.indexOf('/api/browser?url=')!==-1||t.indexOf(PROXY)===0}catch(e){return false}}
function baseHref(){try{return document.baseURI||location.href}catch(e){return location.href}}
function wrap(u,fromBase){
  try{
    var s=String(u);
    if(!s||/^(data:|blob:|javascript:|#)/.test(s))return null;
    if(!isHttp(s)){s=new URL(s,fromBase||baseHref()).href;}
    if(!isHttp(s))return null;
    if(isProxied(s))return s;
    return PROXY+encodeURIComponent(s);
  }catch(e){return null;}
}

/* ── window.location shim ── */
var _loc;try{_loc=window.location}catch(e){}
function curHref(){try{return _loc?_loc.href:window.location.href}catch(e){return '';}}
function actualUrl(){
  try{
    var h=curHref();
    var i=h.indexOf(PROXY);
    if(i===-1)return null;
    return decodeURIComponent(h.slice(i+PROXY.length));
  }catch(e){return null;}
}
function realOrProxy(){return actualUrl()||curHref();}

var _locShim={
  assign:function(u){var w=wrap(u);if(w)_loc.replace(w);},
  replace:function(u){var w=wrap(u);if(w)_loc.replace(w);},
  reload:function(){_loc.replace(PROXY+encodeURIComponent(realOrProxy()));},
  toString:function(){return realOrProxy();},
  valueOf:function(){return realOrProxy();}
};
Object.defineProperty(_locShim,'href',{get:function(){return realOrProxy();},set:function(v){var w=wrap(v);if(w)_loc.replace(w);},configurable:true});
['origin','protocol','host','hostname','port','pathname','search','hash'].forEach(function(p){
  Object.defineProperty(_locShim,p,{get:function(){try{var r=actualUrl();return r?new URL(r)[p]:_loc[p];}catch(e){return _loc[p];}},configurable:true});
});
try{Object.defineProperty(window,'location',{configurable:true,get:function(){return _locShim;},set:function(v){var w=wrap(v);if(w)_loc.replace(w);}});}catch(e){}

/* ── history.pushState / replaceState shim ── */
try{
  var _hPush=history.pushState.bind(history);
  var _hReplace=history.replaceState.bind(history);
  function wrapHistUrl(url,fromBase){
    if(url==null)return url;
    var w=wrap(String(url),fromBase);
    return w||url;
  }
  history.pushState=function(state,title,url){
    var wb=wrapHistUrl(url,realOrProxy());
    _hPush(state,title,wb);
    notifyParent(actualUrl()||curHref());
  };
  history.replaceState=function(state,title,url){
    var wb=wrapHistUrl(url,realOrProxy());
    _hReplace(state,title,wb);
    notifyParent(actualUrl()||curHref());
  };
  window.addEventListener('popstate',function(){notifyParent(actualUrl()||curHref());});
}catch(e){}

/* ── Notify parent frame of URL/title changes ── */
function notifyParent(url,title){
  try{
    window.parent.postMessage({
      __browser:{
        type:'nav',
        url:url||realOrProxy(),
        title:title||document.title||''
      }
    },'*');
  }catch(e){}
}

/* ── MutationObserver for dynamic title changes ── */
try{
  var _lastTitle='';
  var _titleObs=new MutationObserver(function(){
    var t=document.title;
    if(t&&t!==_lastTitle){_lastTitle=t;notifyParent(null,t);}
  });
  document.addEventListener('DOMContentLoaded',function(){
    var tEl=document.querySelector('title');
    if(tEl)_titleObs.observe(tEl,{childList:true,characterData:true,subtree:true});
    // Also observe head for title element being added
    _titleObs.observe(document.head||document.documentElement,{childList:true,subtree:false});
    notifyParent(null,document.title);
  });
}catch(e){}

/* ── XHR / fetch / sendBeacon intercept ── */
try{var _xhrOpen=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){try{var w=wrap(u);if(w)arguments[1]=w;}catch(e){}return _xhrOpen.apply(this,arguments);};}catch(e){}
try{var _oFetch=window.fetch;if(typeof _oFetch==='function'){window.fetch=function(u,o){try{var w=wrap(u instanceof Request?u.url:u);if(w)u=w;}catch(e){}return _oFetch.call(this,u,o);};}}catch(e){}
try{if(navigator.sendBeacon){var _sb=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u,d){try{var w=wrap(u);if(w)u=w;}catch(e){}return _sb(u,d);};}}catch(e){}

/* ── WebSocket intercept ── */
try{
  var _WS=window.WebSocket;
  window.WebSocket=function(url,protocols){
    // Can't proxy WS through HTTP proxy easily; just let it try direct
    return protocols===undefined?new _WS(url):new _WS(url,protocols);
  };
  window.WebSocket.prototype=_WS.prototype;
  window.WebSocket.CONNECTING=_WS.CONNECTING;
  window.WebSocket.OPEN=_WS.OPEN;
  window.WebSocket.CLOSING=_WS.CLOSING;
  window.WebSocket.CLOSED=_WS.CLOSED;
}catch(e){}

/* ── Link click intercept ── */
document.addEventListener('click',function(e){
  var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;
  if(!a)return;
  var href=a.getAttribute('href');
  if(!href||href.startsWith('javascript:'))return;
  try{
    var abs=new URL(href,document.baseURI).href;
    if(isProxied(abs)){e.preventDefault();_loc.replace(abs);return;}
    if(isHttp(abs)){e.preventDefault();_loc.replace(PROXY+encodeURIComponent(abs));}
  }catch(err){}
},true);

/* ── Form submit intercept ── */
document.addEventListener('submit',function(e){
  var f=e.target;
  if(!f||f.tagName!=='FORM')return;
  var action=f.getAttribute('action');
  var method=(f.getAttribute('method')||'get').toLowerCase();
  var baseUrl=realOrProxy();
  try{
    var target=new URL(action||baseUrl,document.baseURI);
    e.preventDefault();
    if(method==='post'){
      var fd=new FormData(f);
      var clone=document.createElement('form');
      clone.method='post';
      clone.action=PROXY+encodeURIComponent(target.href);
      fd.forEach(function(v,k){var i=document.createElement('input');i.type='hidden';i.name=k;i.value=v;clone.appendChild(i);});
      document.body.appendChild(clone);
      clone.submit();
    } else {
      var fd2=new FormData(f);
      var p=new URLSearchParams();
      fd2.forEach(function(v,k){p.append(k,v);});
      target.search=p.toString();
      _loc.replace(PROXY+encodeURIComponent(target.href));
    }
  }catch(err){}
},true);

/* ── window.open → new tab message ── */
try{
  window.open=function(u){
    try{if(isHttp(String(u))&&!isProxied(String(u))){window.parent.postMessage({__browser:{type:'newTab',url:String(u)}},'*');}}catch(e){}
    return null;
  };
}catch(e){}

/* ── Notify parent on load ── */
window.addEventListener('load',function(){notifyParent(null,document.title);});

/* ── Page visibility: notify parent when leaving (SPA soft-nav guard) ── */
try{
  var _navGuardInterval=setInterval(function(){
    try{
      var h=curHref();
      if(h&&isHttp(h)&&!isProxied(h)){
        clearInterval(_navGuardInterval);
        _loc.replace(PROXY+encodeURIComponent(h));
      }
    }catch(e){}
  },500);
}catch(e){}

document.__ANONTWEET_BROWSER__=1;
})();`;

  // Strip existing base tags and meta refresh
  html = html.replace(/<base\b[^>]*>/gi, "");
  html = html.replace(/<meta[^>]*\bhttp-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "");

  // Rewrite static attribute URLs in the HTML
  html = rewriteHtmlAttributes(html, base, proxyBase);

  // Inject base tag + script at end of <head>
  const baseTag = `<base href="${baseHref.replace(/"/g, "&quot;")}">`;
  const injection = `${baseTag}<script>${script}</script>`;
  const marker = "</head>";
  if (html.toLowerCase().includes(marker)) {
    html = html.replace(new RegExp(marker, "i"), injection + marker);
  } else if (html.toLowerCase().includes("<body")) {
    html = html.replace(/<body/i, injection + "<body");
  } else {
    html = injection + html;
  }

  return html;
}

// ─── Cookie Jar ───────────────────────────────────────────────────────────────

function parseJar(raw) {
  try {
    const jar = raw ? JSON.parse(decodeURIComponent(raw)) : {};
    return jar && typeof jar === "object" ? jar : {};
  } catch {
    return {};
  }
}

function cookieHeader(jar, host) {
  const pairs = [];
  for (const [dom, map] of Object.entries(jar)) {
    if (!map || typeof map !== "object") continue;
    const applicable =
      dom === host || host.endsWith("." + dom) || dom.endsWith("." + host);
    if (!applicable) continue;
    for (const [name, value] of Object.entries(map)) {
      if (value) pairs.push(`${name}=${value}`);
    }
  }
  return pairs.join("; ");
}

function mergeCookieJar(jar, host, setCookieList) {
  const map = {
    ...(jar[host] && typeof jar[host] === "object" ? jar[host] : {}),
  };
  for (const raw of setCookieList || []) {
    const parts = String(raw)
      .split(";")
      .map((s) => s.trim());
    if (!parts.length) continue;
    const eq = parts[0].indexOf("=");
    if (eq <= 0) continue;
    const name = parts[0].slice(0, eq);
    const value = parts[0].slice(eq + 1);
    let dom = host;
    const domainPart = parts.find((p) => /^domain\s*=/i.test(p));
    if (domainPart) {
      const d = domainPart
        .replace(/^domain\s*=\s*/i, "")
        .replace(/^\./, "")
        .trim();
      if (d) dom = d;
    }
    const expire = parts.find((p) => /^max-age\s*=/i.test(p));
    const expired = expire && /max-age\s*=\s*0/i.test(expire);
    const jarEntry =
      jar[dom] && typeof jar[dom] === "object" ? { ...jar[dom] } : {};
    const mergedForDom = dom === host ? map : jarEntry;
    if (!value || expired) {
      delete mergedForDom[name];
    } else {
      mergedForDom[name] = value;
    }
    if (dom !== host) jar[dom] = jarEntry;
  }
  jar[host] = map;
  return jar;
}

function capJar(jar) {
  const out = {};
  let budget = 4000; // slightly larger budget
  for (const [host, map] of Object.entries(jar)) {
    if (!map || typeof map !== "object") continue;
    const serialized = JSON.stringify(map);
    if (budget - serialized.length < 0) continue;
    out[host] = map;
    budget -= serialized.length;
  }
  return out;
}

// ─── Fetch upstream ───────────────────────────────────────────────────────────

async function fetchPage(target, method, bodyParams, cookies, referer) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const headers = {
    "User-Agent": BROWSER_UA,
    "Accept-Language": "en-US,en;q=0.9",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Ch-Ua": '"Chromium";v="125", "Not.A/Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
  };

  if (referer) {
    headers["Referer"] = referer;
    headers["Sec-Fetch-Site"] = "same-origin";
  }

  if (method === "POST") {
    headers["Content-Type"] =
      "application/x-www-form-urlencoded; charset=UTF-8";
  }
  if (cookies) {
    headers["Cookie"] = cookies;
  }

  const res = await fetch(target.toString(), {
    method,
    headers,
    body: method === "POST" ? (bodyParams || "").toString() : undefined,
    redirect: "follow",
    signal: controller.signal,
    cache: "no-store",
  });
  clearTimeout(timer);
  return res;
}

// ─── Asset fetch (JS/CSS/images) ──────────────────────────────────────────────

async function fetchAsset(target, cookies, referer) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const headers = {
    "User-Agent": BROWSER_UA,
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "*/*",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };
  if (referer) headers["Referer"] = referer;
  if (cookies) headers["Cookie"] = cookies;

  const res = await fetch(target.toString(), {
    method: "GET",
    headers,
    redirect: "follow",
    signal: controller.signal,
    cache: "no-store",
  });
  clearTimeout(timer);
  return res;
}

// ─── Build safe response headers ─────────────────────────────────────────────

function buildSafeHeaders(upstreamHeaders, contentType, extra = {}) {
  const out = {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    // Permissive CSP for our proxy wrapper
    "Content-Security-Policy":
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
      "script-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
      "style-src * 'unsafe-inline' data:; " +
      "font-src * data: blob:; " +
      "img-src * data: blob:; " +
      "media-src * data: blob:; " +
      "frame-src *; " +
      "connect-src *; " +
      "worker-src * blob:;",
    ...extra,
  };

  // Forward safe upstream headers
  const forwardable = [
    "content-language",
    "last-modified",
    "etag",
    "vary",
  ];
  for (const h of forwardable) {
    const v = upstreamHeaders.get(h);
    if (v) out[h] = v;
  }

  return out;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const referer = searchParams.get("ref") || null;
  return handle(request, searchParams.get("url"), "GET", null, referer);
}

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const bodyText = await request.text();
  let bodyParams = bodyText;
  try {
    bodyParams = new URLSearchParams(bodyText);
  } catch {
    return NextResponse.json({ error: "Bad POST body" }, { status: 400 });
  }
  const referer = searchParams.get("ref") || null;
  return handle(request, searchParams.get("url"), "POST", bodyParams.toString(), referer);
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

async function handle(request, rawUrl, method, bodyParams, referer) {
  const proto = request.nextUrl.protocol;
  const host = request.nextUrl.host;
  const proxyBase = `${proto}//${host}/api/browser?url=`;

  if (!rawUrl) {
    return new NextResponse(renderError("Missing ?url= parameter"), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  let target;
  try {
    target = new URL(
      /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    );
  } catch {
    return new NextResponse(renderError("Invalid URL"), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (!/^https?:$/.test(target.protocol)) {
    return new NextResponse(renderError("Only http/https URLs are supported"), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  if (isPrivateHost(target.hostname)) {
    return new NextResponse(
      renderError("This address is not accessible from the in-app browser"),
      { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  try {
    const jar = parseJar(request.cookies.get("_anb_cookies")?.value);
    const upstreamCookies = cookieHeader(jar, target.host);

    // Detect if this looks like a sub-resource request (JS, CSS, image, font)
    const acceptHeader = request.headers.get("accept") || "";
    const isSubResource =
      method === "GET" &&
      !acceptHeader.includes("text/html") &&
      (acceptHeader.includes("text/css") ||
        acceptHeader.includes("application/javascript") ||
        acceptHeader.includes("*/*") ||
        /\.(js|css|woff2?|ttf|otf|eot|png|jpg|jpeg|gif|webp|svg|ico|mp4|webm|mp3|wav)(\?|$)/i.test(
          target.pathname
        ));

    const res = isSubResource
      ? await fetchAsset(target, upstreamCookies, referer || target.href)
      : await fetchPage(target, method, bodyParams, upstreamCookies, referer);

    let setCookieList = [];
    if (typeof res.headers.getSetCookie === "function") {
      setCookieList = res.headers.getSetCookie();
    } else {
      const single = res.headers.get("set-cookie");
      if (single) setCookieList = [single];
    }
    const mergedJar = capJar(mergeCookieJar(jar, target.host, setCookieList));

    const contentType =
      res.headers.get("content-type") || "application/octet-stream";
    const ctLower = contentType.toLowerCase();
    const isHtml = ctLower.includes("text/html");
    const isCss = ctLower.includes("text/css");
    const isJs =
      ctLower.includes("javascript") || ctLower.includes("ecmascript");

    if (isHtml) {
      let html = await res.text();
      html = processHtml(html, target, proxyBase);
      const outHeaders = buildSafeHeaders(res.headers, contentType);
      const out = new NextResponse(html, {
        status: res.status,
        headers: outHeaders,
      });
      out.cookies.set("_anb_cookies", encodeURIComponent(JSON.stringify(mergedJar)), {
        path: "/",
        maxAge: 60 * 60 * 24 * 90,
        sameSite: "lax",
      });
      return out;
    }

    if (isCss) {
      let css = await res.text();
      css = rewriteCss(css, target.href, proxyBase);
      const outHeaders = buildSafeHeaders(res.headers, contentType);
      const out = new NextResponse(css, {
        status: res.status,
        headers: outHeaders,
      });
      out.cookies.set("_anb_cookies", encodeURIComponent(JSON.stringify(mergedJar)), {
        path: "/",
        maxAge: 60 * 60 * 24 * 90,
        sameSite: "lax",
      });
      return out;
    }

    if (isJs) {
      let js = await res.text();
      js = wrapJs(js, proxyBase);
      const outHeaders = buildSafeHeaders(res.headers, contentType);
      const out = new NextResponse(js, {
        status: res.status,
        headers: outHeaders,
      });
      out.cookies.set("_anb_cookies", encodeURIComponent(JSON.stringify(mergedJar)), {
        path: "/",
        maxAge: 60 * 60 * 24 * 90,
        sameSite: "lax",
      });
      return out;
    }

    // Binary / other (images, fonts, media, etc.)
    const buf = await res.arrayBuffer();
    const outHeaders = buildSafeHeaders(res.headers, contentType);
    const out = new NextResponse(new Uint8Array(buf), {
      status: res.status,
      headers: outHeaders,
    });
    out.cookies.set("_anb_cookies", encodeURIComponent(JSON.stringify(mergedJar)), {
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
      sameSite: "lax",
    });
    return out;
  } catch (err) {
    const msg = err?.name === "AbortError"
      ? "Request timed out (page took too long to load)"
      : `Could not load page: ${err?.message || "unknown error"}`;
    return new NextResponse(renderError(msg), {
      status: 502,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

// ─── Error page ───────────────────────────────────────────────────────────────

function renderError(message) {
  const safeMsg = String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#0f0f0f;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
    .card{text-align:center;padding:40px 32px;max-width:480px;width:100%;background:#1a1a1a;border-radius:16px;border:1px solid #2a2a2a}
    .icon{font-size:56px;margin-bottom:16px}
    h1{font-size:20px;font-weight:600;margin-bottom:8px;color:#fff}
    p{font-size:14px;color:#888;line-height:1.5;word-break:break-word}
    .hint{margin-top:16px;font-size:12px;color:#555}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🌐</div>
    <h1>Unable to load page</h1>
    <p>${safeMsg}</p>
    <p class="hint">AnonTweet Browser · Try a different URL or check your connection</p>
  </div>
</body>
</html>`;
}
