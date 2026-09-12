function encodePath(p: string): string {
  return p
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}

function dirBase(): string {
  if (typeof window === "undefined") return "/";
  const injected = (window as Window & { __HEX_BASE__?: string }).__HEX_BASE__;
  if (injected) return injected.endsWith("/") ? injected : `${injected}/`;
  const u = new URL(window.location.href);
  let p = u.pathname;
  if (/\.[a-z0-9]+$/i.test(p)) p = p.replace(/\/[^/]+$/, "/");
  else if (!p.endsWith("/")) p += "/";
  return `${u.origin}${encodePath(p)}`;
}

/** Public file URL that works in a subdirectory (e.g. /NuovaCartella/hexagon-aruba/). */
export function publicUrl(path: string): string {
  if (!path) return path;
  if (/^(blob:|data:|https?:)/i.test(path)) return path;
  const rel = path.replace(/^\//, "");
  return new URL(rel, dirBase()).href;
}
