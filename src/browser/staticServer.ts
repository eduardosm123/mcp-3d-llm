import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".bin": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".obj": "text/plain; charset=utf-8",
  ".mtl": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".hdr": "application/octet-stream",
  ".ktx2": "application/octet-stream",
};

export interface StaticServer {
  baseUrl: string;
  close(): Promise<void>;
}

/**
 * Serves `rootDir` at / and the bundled helper libraries at /__helpers/,
 * so AI-written HTML can always use <script src="/__helpers/xxx.js">
 * regardless of where the HTML file lives on disk.
 */
export async function serveDirectory(rootDir: string, helpersDir: string): Promise<StaticServer> {
  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) {
        res.writeHead(405).end();
        return;
      }
      const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);

      let filePath: string;
      if (urlPath.startsWith("/__helpers/")) {
        filePath = safeJoin(helpersDir, urlPath.slice("/__helpers/".length));
      } else {
        filePath = safeJoin(rootDir, urlPath.replace(/^\//, ""));
      }

      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

function safeJoin(root: string, rel: string): string {
  const resolved = path.resolve(root, rel);
  const normalizedRoot = path.resolve(root);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    throw new Error("path traversal blocked");
  }
  return resolved;
}
