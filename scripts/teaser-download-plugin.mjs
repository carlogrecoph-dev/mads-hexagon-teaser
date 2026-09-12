import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * POST /api/teasers  → stores the MP4
 * GET  /api/teasers/:id → serves it with Content-Disposition: attachment
 *
 * Preview iframes block blob: downloads; a same-origin HTTP file works.
 */
export function teaserDownloadPlugin() {
  const files = new Map();
  const dir = join(process.cwd(), "public", "teasers");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }

  function handle(req, res, next) {
    const raw = req.url ?? "";
    const pathOnly = raw.split("?", 1)[0] ?? "";
    if (!pathOnly.startsWith("/api/teasers") && pathOnly !== "/api/desktop.zip") {
      next();
      return;
    }

    const method = (req.method ?? "GET").toUpperCase();

    if (method === "POST" && pathOnly === "/api/teasers") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        try {
          const buf = Buffer.concat(chunks);
          if (buf.length < 64 || buf.length > 250 * 1024 * 1024) {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: "invalid video" }));
            return;
          }
          const q = new URL(raw, "http://local.teaser");
          const rawName = q.searchParams.get("name") || "teaser.mp4";
          const name = rawName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
          const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
          const mime = String(req.headers["content-type"] || "video/mp4");
          files.set(id, { buf, name, mime });
          if (files.size > 12) files.delete(files.keys().next().value);
          try {
            writeFileSync(join(dir, name), buf);
          } catch {
            /* disk optional */
          }
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ id, url: `/api/teasers/${id}`, name }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (method === "GET" && pathOnly === "/api/desktop.zip") {
      const row = [...files.values()].reverse().find((f) => String(f.name).endsWith(".zip"));
      if (!row) {
        res.statusCode = 404;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end("Prepara prima lo zip da App desktop.");
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", "application/zip");
      res.setHeader("content-length", String(row.buf.length));
      res.setHeader("content-disposition", 'attachment; filename="MADS-Hexagon-desktop.zip"');
      res.setHeader("cache-control", "no-store");
      res.end(row.buf);
      return;
    }

    if (method === "GET" && pathOnly.startsWith("/api/teasers/")) {
      const id = pathOnly.slice("/api/teasers/".length).replace(/\/$/, "");
      const row = files.get(id);
      if (!row) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", row.mime);
      res.setHeader("content-length", String(row.buf.length));
      res.setHeader("content-disposition", `attachment; filename="${row.name}"`);
      res.setHeader("cache-control", "no-store");
      res.end(row.buf);
      return;
    }

    res.statusCode = 405;
    res.end("method not allowed");
  }

  return {
    name: "mads-teaser-download",
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}
