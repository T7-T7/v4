import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import chatHandler from "./api/chat.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const types = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".svg":"image/svg+xml", ".woff2":"font/woff2", ".ttf":"font/ttf" };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/api/chat") {
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) { res.writeHead(413).end(); return; } }
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { res.writeHead(400, { "content-type":"application/json" }).end(JSON.stringify({ success:false, error:"Invalid JSON" })); return; }
    res.status = code => { res.statusCode = code; return res; };
    res.json = value => { res.setHeader("content-type", "application/json; charset=utf-8"); res.end(JSON.stringify(value)); return res; };
    res.setHeader = res.setHeader.bind(res);
    return chatHandler(req, res);
  }
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = normalize(join(root, pathname));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try { const data = await readFile(file); res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" }).end(data); }
  catch { res.writeHead(404).end("Not found"); }
});
server.listen(process.env.PORT || 3000, () => console.log(`Pix AI listening on http://localhost:${process.env.PORT || 3000}`));
