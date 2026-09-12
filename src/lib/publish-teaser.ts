/** Upload the encoded teaser so it has a same-origin HTTP URL (iframe-safe). */
export async function publishTeaser(blob: Blob, name: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/teasers?name=${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { "content-type": blob.type || "video/mp4" },
      body: blob,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}
