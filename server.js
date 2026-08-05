const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const host = "127.0.0.1";
const port = Number(process.env.SHITI_PORT) || 4173;
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

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
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
  console.log(`拾题学习助手已启动：http://${host}:${port}`);
});
