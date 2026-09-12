import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BROWSER_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function isPrivateHost(hostname) {
    const host = (hostname || "").toLowerCase().replace(/[\[\]]/g, "");
    if (
        host === "localhost" ||
        host === "0.0.0.0" ||
        host.endsWith(".localhost") ||
        host.endsWith(".local") ||
        host.endsWith(".internal")
    ) {
        return true;
    }
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

function baseTagHref(target) {
    let dir = target.pathname || "/";
    if (!dir.endsWith("/")) {
        const idx = dir.lastIndexOf("/");
        dir = idx >= 0 ? dir.slice(0, idx + 1) : "/";
    }
    return `${target.origin}${dir}`;
}

function injectScript(html, baseHref, proxyBase) {
    if (html.includes("__ANONTWEET_BROWSER__")) return html;

    const script = `(function(){
var PROXY=${JSON.stringify(proxyBase)};
function isHttp(s){try{return /^https?:/.test(String(s))}catch(e){return false}}
function proxied(s){try{var t=String(s);return t.indexOf('/api/browser?url=')!==-1||t.indexOf(PROXY)===0}catch(e){return false}}
function baseHref(){try{return document.baseURI}catch(e){return location.href}}
function wrap(u){try{var s=String(u);if(!isHttp(s)){s=new URL(s,baseHref()).href}if(isHttp(s)){if(proxied(s))return s;return PROXY+encodeURIComponent(s)}return null}catch(e){return null}}
function goTo(u){var w=wrap(u);if(w===null)return false;try{window.location.href=w;return true}catch(e){try{window.location.replace(w);return true}catch(e2){return false}}}
var loc;
try{loc=window.location}catch(e){}
function curHref(){try{return loc?loc.href:window.location.href}catch(e){return ''}}
function actualUrl(){try{var h=curHref();var i=h.indexOf(PROXY);if(i===-1)return null;var u=h.slice(i+PROXY.length);u=decodeURIComponent(u);return new URL(u).href}catch(e){return null}}
function realOrProxy(){return actualUrl()||loc.href}
try{
  var fake={
    assign:function(u){var w=wrap(u);if(w)loc.replace(w)},
    replace:function(u){var w=wrap(u);if(w)loc.replace(w)},
    reload:function(){try{var w=wrap(curHref());loc.replace(w||PROXY+encodeURIComponent(curHref()))}catch(e){}},
    toString:function(){return realOrProxy()},
    valueOf:function(){return realOrProxy()}
  };
  Object.defineProperty(fake,'href',{get:function(){return realOrProxy()},set:function(v){var w=wrap(v);if(w)loc.replace(w)},configurable:true});
  ['origin','protocol','host','hostname','port','pathname','search','hash'].forEach(function(p){
    Object.defineProperty(fake,p,{get:function(){try{var r=actualUrl();if(!r)return loc[p];return new URL(r)[p]}catch(e){return loc[p]}},configurable:true});
  });
  Object.defineProperty(window,'location',{configurable:true,get:function(){return fake},set:function(v){var w=wrap(v);if(w)loc.replace(w)}});
}catch(e){}
function abs(h){try{return new URL(h,document.baseURI).href}catch(err){return null}}
document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;var href=abs(a.getAttribute('href'));if(!href)return;if(proxied(href)){e.preventDefault();window.location.replace(href)}else{e.preventDefault();goTo(href)}},true);
document.addEventListener('submit',function(e){var f=e.target;if(!f||f.tagName!=='FORM')return;var action=f.getAttribute('action');var url=new URL(action||window.location.href,document.baseURI);var fd=new FormData(f);e.preventDefault();var method=(f.getAttribute('method')||'get').toLowerCase();if(method==='post'){var form=document.createElement('form');form.method='post';form.action=PROXY+encodeURIComponent(url.href);fd.forEach(function(v,k){var i=document.createElement('input');i.type='hidden';i.name=k;i.value=v;form.appendChild(i)});document.body.appendChild(form);form.submit()}else{var url2=new URL(action||curHref(),document.baseURI);var p=new URLSearchParams();fd.forEach(function(v,k){p.append(k,v)});url2.search=p.toString();goTo(url2.href)}},true);
try{window.open=function(u){try{if(isHttp(u)&&!proxied(u)){window.parent.postMessage({__browser:{newTab:String(u)}},'*')}}catch(e){}return null}}catch(e){}
(function(){
  function proxify(u){try{if(u==null)return u;var s=(u instanceof URL)?u.href:(typeof u==='string'?u:u&&u.url);if(typeof s!=='string')return u;var w=wrap(s);if(w)return w;if(u&&typeof u==='object'&&'href'in u){try{u.href=s}catch(e){}}return u}catch(e){return u}}
  try{var _op=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){try{arguments[1]=proxify(u)}catch(e){}return _op.apply(this,arguments)}}catch(e){}
  try{var _f=window.fetch;if(typeof _f==='function'){window.fetch=function(u,o){try{u=proxify(u)}catch(e){}return _f.call(this,u,o)}}}catch(e){}
  try{if(navigator.sendBeacon){var _sb=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u,d){try{u=proxify(u)}catch(e){}return _sb(u,d)}}}catch(e){}
})();
try{setInterval(function(){try{var h=curHref();if(h&&isHttp(h)&&!proxied(h)){window.location.replace(PROXY+encodeURIComponent(h))}}catch(e){}},250)}catch(e){}
document.__ANONTWEET_BROWSER__=1;
})();`;

    const baseTag = `<base href="${baseHref.replace(/"/g, "&quot;")}">`;
    html = html.replace(/<base\b[^>]*>/gi, "");
    html = html.replace(/<meta[^>]*\bhttp-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "");
    const marker = "</head>";
    const injection = `${baseTag}<script>${script}</script>`;
    if (html.toLowerCase().includes(marker)) {
        html = html.replace(new RegExp(marker, "i"), injection + marker);
    } else {
        html = injection + html;
    }
return html;
}

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
        const applicable = dom === host || host.endsWith("." + dom) || dom.endsWith("." + host);
        if (!applicable) continue;
        for (const [name, value] of Object.entries(map)) {
            if (value) pairs.push(`${name}=${value}`);
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
        const domainPart = parts.find((p) => /^domain\s*=/i.test(p));
        if (domainPart) {
            const d = domainPart.replace(/^domain\s*=\s*/i, "").replace(/^\./, "").trim();
            if (d) dom = d;
        }
        const expire = parts.find((p) => /^max-age\s*=/i.test(p));
        const expired = expire && /max-age\s*=\s*0/i.test(expire);
        const jarEntry = jar[dom] && typeof jar[dom] === "object" ? { ...jar[dom] } : {};
        const mergedForDom = (dom === host ? map : jarEntry);
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
    let budget = 3000;
    for (const [host, map] of Object.entries(jar)) {
        if (!map || typeof map !== "object") continue;
        const serialized = JSON.stringify(map);
        if (budget - serialized.length < 0) continue;
        out[host] = map;
        budget -= serialized.length;
    }
    return out;
}

async function fetchPage(target, method, bodyParams, cookies) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const headers = {
        "User-Agent": BROWSER_UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
    };

    let body;
    if (method === "POST") {
        headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
        body = (bodyParams || "").toString();
    }
    if (cookies) {
        headers["Cookie"] = cookies;
    }

    const finalUrl = target.toString();
    const res = await fetch(finalUrl, {
        method,
        headers,
        body,
        redirect: "follow",
        signal: controller.signal,
        cache: "no-store",
    });
    clearTimeout(timer);
    return res;
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    return handle(request, searchParams.get("url"), "GET", null);
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
    return handle(request, searchParams.get("url"), "POST", bodyParams.toString());
}

export async function OPTIONS(request) {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": request.headers.get("origin") || "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": request.headers.get("access-control-request-headers") || "*",
            "Access-Control-Max-Age": "86400",
        },
    });
}

async function handle(request, rawUrl, method, bodyParams) {
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
        target = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
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
        return new NextResponse(renderError("This address is not accessible from the in-app browser"), {
            status: 403,
            headers: { "Content-Type": "text/html; charset=utf-8" },
        });
    }

    try {
        const jar = parseJar(request.cookies.get("_anb_cookies")?.value);
        const upstreamCookies = cookieHeader(jar, target.host);
        const res = await fetchPage(target, method, bodyParams, upstreamCookies);

        let setCookieList = [];
        if (typeof res.headers.getSetCookie === "function") {
            setCookieList = res.headers.getSetCookie();
        } else {
            const single = res.headers.get("set-cookie");
            if (single) setCookieList = [single];
        }
        const mergedJar = capJar(mergeCookieJar(jar, target.host, setCookieList));

        const contentType = res.headers.get("content-type") || "application/octet-stream";
        const isHtml = contentType.toLowerCase().includes("text/html");

        const outHeaders = {
            "Content-Type": contentType,
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
        };

        if (isHtml) {
            let html = await res.text();
            html = injectScript(html, baseTagHref(target), proxyBase);
            const out = new NextResponse(html, { status: res.status, headers: outHeaders });
            out.cookies.set("_anb_cookies", encodeURIComponent(JSON.stringify(mergedJar)), {
                path: "/",
                maxAge: 60 * 60 * 24 * 90,
                sameSite: "lax",
            });
            return out;
        }

        const buf = await res.arrayBuffer();
        const out = new NextResponse(new Uint8Array(buf), {
            status: res.status,
            headers: {
                ...outHeaders,
                "Content-Security-Policy": "default-src * 'unsafe-inline' 'unsafe-eval'; font-src * data:; img-src * data: blob:; style-src * 'unsafe-inline'; script-src * 'unsafe-inline' 'unsafe-eval'; frame-src *; connect-src *; media-src * blob:;",
            },
        });
        out.cookies.set("_anb_cookies", encodeURIComponent(JSON.stringify(mergedJar)), {
            path: "/",
            maxAge: 60 * 60 * 24 * 90,
            sameSite: "lax",
        });
        return out;
    } catch (err) {
        return new NextResponse(renderError(`Could not load page: ${err?.message || "unknown error"}`), {
            status: 502,
            headers: { "Content-Type": "text/html; charset=utf-8" },
        });
    }
}

function renderError(message) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}div{text-align:center;padding:24px}.e{font-size:48px}</style></head><body><div><div class="e">⚠️</div><p>${String(message).replace(/</g, "&lt;")}</p><p style="color:#888;font-size:13px">AnonTweet Browser</p></div></body></html>`;
}