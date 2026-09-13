/** Deliver a teaser file. Prefer a user-gesture <a download>; never swallow fallbacks. */

type SavePicker = (opts: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }>;

export function isMobileClient() {
  return typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

function fileNameOf(name: string) {
  const n = (name || "teaser.mp4").replace(/[^\w.\-]+/g, "_");
  return n.toLowerCase().endsWith(".mp4") || n.toLowerCase().endsWith(".webm") ? n : `${n}.mp4`;
}

function clickAnchor(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.target = "_blank";
  a.type = "video/mp4";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function hiddenFrame(url: string) {
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.src = url;
  document.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), 20_000);
}

export async function deliverTeaser(blob: Blob | undefined, name: string, href?: string | null) {
  const fileName = fileNameOf(name);
  const absHref = href ? new URL(href, window.location.href).href : null;

  if (blob && blob.size > 0 && isMobileClient()) {
    const file = new File([blob], fileName, { type: blob.type || "video/mp4" });
    const nav = navigator as Navigator & {
      share?: (d: ShareData) => Promise<void>;
      canShare?: (d: ShareData) => boolean;
    };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: fileName });
        return;
      } catch {
        /* user closed the sheet or share failed — fall through to download */
      }
    }
  }

  if (blob && blob.size > 0) {
    const url = URL.createObjectURL(blob);
    clickAnchor(url, fileName);
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    if (absHref && !absHref.startsWith("blob:")) hiddenFrame(absHref);
    return;
  }

  if (absHref) {
    clickAnchor(absHref, fileName);
    hiddenFrame(absHref);
  }
}

export async function shareOrSave(blob: Blob, name: string) {
  await deliverTeaser(blob, name, null);
}

export async function saveFile(blob: Blob, name: string) {
  await deliverTeaser(blob, name, null);
}

/** Unused picker kept for desktop packs that really need a Save dialog. */
export async function pickAndWrite(blob: Blob, name: string) {
  const nav = navigator as Navigator & { showSaveFilePicker?: SavePicker };
  if (typeof nav.showSaveFilePicker !== "function") return false;
  try {
    const handle = await nav.showSaveFilePicker({
      suggestedName: fileNameOf(name),
      types: [{ description: "Video", accept: { "video/mp4": [".mp4"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}
