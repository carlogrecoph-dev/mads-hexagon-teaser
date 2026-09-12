/** Deliver a teaser file. Iframe previews block a[download]; open a real tab. */

type SavePicker = (opts: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }>;

export function isMobileClient() {
  return typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

function openWatchPage(blob: Blob, name: string) {
  const videoUrl = URL.createObjectURL(blob);
  const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${name}</title>
  <style>
    html,body{margin:0;background:#0e0d0c;color:#f4efe6;font-family:system-ui,sans-serif;min-height:100%}
    video{display:block;width:100%;max-height:78vh;background:#000}
    .bar{padding:16px 18px 24px}
    a,button{display:inline-flex;align-items:center;justify-content:center;
      background:#e11d8c;color:#fff;text-decoration:none;border:0;border-radius:12px;
      padding:12px 16px;font:600 15px/1 system-ui;margin:8px 8px 0 0;cursor:pointer}
  </style>
</head>
<body>
  <video id="v" controls autoplay playsinline src="${videoUrl}"></video>
  <div class="bar">
    <p>Se il file non si scarica da solo: tasto destro sul video → <b>Salva video come…</b></p>
    <a href="${videoUrl}" download="${name}">Scarica ${name}</a>
  </div>
</body>
</html>`;
  const page = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const w = window.open(page, "_blank", "noopener");
  if (!w) {
    window.location.href = videoUrl;
  }
}

export async function deliverTeaser(blob: Blob | undefined, name: string, href?: string | null) {
  if (href) {
    const w = window.open(href, "_blank", "noopener");
    if (w) return;
    window.location.assign(href);
    return;
  }
  if (!blob) return;

  const file = new File([blob], name, { type: blob.type || "video/mp4" });
  const nav = navigator as Navigator & {
    share?: (d: ShareData) => Promise<void>;
    canShare?: (d: ShareData) => boolean;
    showSaveFilePicker?: SavePicker;
  };

  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }

  if (typeof nav.showSaveFilePicker === "function" && !isMobileClient()) {
    try {
      const handle = await nav.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: "Video", accept: { "video/mp4": [".mp4"], "video/webm": [".webm"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }

  openWatchPage(blob, name);
}

export async function shareOrSave(blob: Blob, name: string) {
  await deliverTeaser(blob, name, null);
}

export async function saveFile(blob: Blob, name: string) {
  await deliverTeaser(blob, name, null);
}
