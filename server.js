const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || process.env.SHITI_PORT) || 4173;
const root = __dirname;
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".gz": "application/gzip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 16 * 1024) {
        request.destroy();
        reject(new Error("请求内容过大"));
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("请求格式不正确"));
      }
    });
    request.on("error", reject);
  });
}

function decodeHtml(value = "") {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  return decodeHtml(html.match(pattern)?.[1] || "");
}

function pageTitle(html) {
  return decodeHtml(metaContent(html, "og:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
}

function visibleTextFromHtml(html) {
  return decodeHtml(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " "))
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 12 && !/^https?:\/\//.test(line))
    .slice(0, 80)
    .join("\n");
}

function extractKeywords(text) {
  const candidates = ["成长", "选择", "责任", "科技", "文化", "青年", "奋斗", "创新", "时代", "社会", "人物", "教育", "理想", "自然", "规则"];
  return candidates.filter((word) => text.includes(word)).slice(0, 6);
}

async function extractVideoMaterial(request, response) {
  try {
    const { url } = await readJsonBody(request);
    const target = new URL(url);
    if (!["http:", "https:"].includes(target.protocol)) throw new Error("请填写完整、有效的视频链接");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const remote = await fetch(target, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ShitiStudyAssistant/1.0)",
        "Accept": "text/html,application/xhtml+xml"
      }
    });
    clearTimeout(timeout);
    if (!remote.ok) throw new Error("视频页面无法访问");
    const html = await remote.text();
    const title = pageTitle(html) || "视频关键观点摘录";
    const description = metaContent(html, "description") || metaContent(html, "og:description");
    const text = [description, visibleTextFromHtml(html)].filter(Boolean).join("\n\n").slice(0, 4000);
    if (text.length < 20) throw new Error("没有提取到公开视频文字，请粘贴字幕或文案");
    sendJson(response, 200, { title: title.slice(0, 36), text, keywords: extractKeywords(text) });
  } catch (error) {
    sendJson(response, 400, { message: error.name === "AbortError" ? "视频页面访问超时" : error.message });
  }
}

http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }
  const pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
  if (pathname === "/api/material/video-extract" && request.method === "POST") {
    await extractVideoMaterial(request, response);
    return;
  }

  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(root, requested);

  if (!filePath.startsWith(root + path.sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(content);
  });
}).listen(port, host, () => {
  const shownHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  console.log(`拾题学习助手已启动：http://${shownHost}:${port}`);
});
