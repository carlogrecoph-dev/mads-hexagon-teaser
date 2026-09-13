/** Official M.A.D.S. wordmark: overlapping magenta / gold M peaks + Outfit type. */

const GOLD = "#F0D24A";
const MAGENTA = "#E63B8A";
const FONT = 'Outfit, "Helvetica Neue", Helvetica, sans-serif';

function mPath(x: number, y: number, w: number, h: number) {
  const x0 = x;
  const x1 = x + w * 0.25;
  const x2 = x + w * 0.5;
  const x3 = x + w * 0.75;
  const x4 = x + w;
  const yTop = y;
  const yBot = y + h;
  const yMid = y + h * 0.52;
  return `M ${x0} ${yBot} L ${x1} ${yTop} L ${x2} ${yMid} L ${x3} ${yTop} L ${x4} ${yBot}`;
}

export function madsLogoSvg(size = 1024) {
  const s = size;
  const stroke = s * 0.048;
  const magenta = mPath(s * 0.08, s * 0.26, s * 0.54, s * 0.42);
  const gold = mPath(s * 0.38, s * 0.26, s * 0.54, s * 0.42);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
  <rect width="${s}" height="${s}" fill="#0a0a0c"/>
  <text x="${s / 2}" y="${s * 0.16}" text-anchor="middle" fill="${MAGENTA}"
    font-family="${FONT}" font-size="${s * 0.042}"
    letter-spacing="${s * 0.022}" font-weight="500">ART GALLERY</text>
  <g fill="none" stroke-linecap="butt" stroke-linejoin="miter">
    <path d="${magenta}" stroke="${MAGENTA}" stroke-width="${stroke}"/>
    <path d="${gold}" stroke="${GOLD}" stroke-width="${stroke}"/>
  </g>
  <text x="${s * 0.30}" y="${s * 0.72}" text-anchor="middle" fill="${MAGENTA}"
    font-family="${FONT}" font-size="${s * 0.09}" font-weight="500">A</text>
  <text x="${s * 0.5}" y="${s * 0.72}" text-anchor="middle" fill="${MAGENTA}"
    font-family="${FONT}" font-size="${s * 0.09}" font-weight="500">D</text>
  <text x="${s * 0.70}" y="${s * 0.72}" text-anchor="middle" fill="${MAGENTA}"
    font-family="${FONT}" font-size="${s * 0.09}" font-weight="500">S</text>
  <text x="${s / 2}" y="${s * 0.9}" text-anchor="middle" fill="${MAGENTA}"
    font-family="${FONT}" font-size="${s * 0.024}" font-weight="400"
    letter-spacing="${s * 0.008}">MEDIATOR ADVISOR DEALER SEEKER</text>
  <text x="${s / 2}" y="${s * 0.95}" text-anchor="middle" fill="${GOLD}"
    font-family="${FONT}" font-size="${s * 0.018}" font-weight="400">mads@madsgallery.art</text>
  <text x="${s / 2}" y="${s * 0.985}" text-anchor="middle" fill="${MAGENTA}"
    font-family="${FONT}" font-size="${s * 0.018}" font-weight="400">www.madsgallery.art</text>
</svg>`;
}

export function drawMadsLogo(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#0a0a0c";
  ctx.fillRect(0, 0, w, h);
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  ctx.lineWidth = w * 0.048;

  const drawM = (x: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    const ww = w * 0.54;
    const y = h * 0.26;
    const hh = h * 0.42;
    ctx.moveTo(x, y + hh);
    ctx.lineTo(x + ww * 0.25, y);
    ctx.lineTo(x + ww * 0.5, y + hh * 0.52);
    ctx.lineTo(x + ww * 0.75, y);
    ctx.lineTo(x + ww, y + hh);
    ctx.stroke();
  };

  drawM(w * 0.08, MAGENTA);
  drawM(w * 0.38, GOLD);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = MAGENTA;
  ctx.font = `500 ${w * 0.042}px ${FONT}`;
  ctx.letterSpacing = `${w * 0.02}px`;
  ctx.fillText("ART GALLERY", w / 2, h * 0.16);

  ctx.letterSpacing = "0px";
  ctx.font = `500 ${w * 0.09}px ${FONT}`;
  ctx.fillStyle = MAGENTA;
  ctx.fillText("A", w * 0.3, h * 0.72);
  ctx.fillText("D", w * 0.5, h * 0.72);
  ctx.fillText("S", w * 0.7, h * 0.72);

  ctx.fillStyle = MAGENTA;
  ctx.font = `400 ${w * 0.024}px ${FONT}`;
  ctx.letterSpacing = `${w * 0.007}px`;
  ctx.fillText("MEDIATOR ADVISOR DEALER SEEKER", w / 2, h * 0.9);

  ctx.letterSpacing = `${w * 0.004}px`;
  ctx.font = `400 ${w * 0.018}px ${FONT}`;
  ctx.fillStyle = GOLD;
  ctx.fillText("mads@madsgallery.art", w / 2, h * 0.95);
  ctx.fillStyle = MAGENTA;
  ctx.fillText("www.madsgallery.art", w / 2, h * 0.985);
}

export function makeLogoDataUrl(size = 1024) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  drawMadsLogo(ctx, size, size);
  return canvas.toDataURL("image/png");
}
