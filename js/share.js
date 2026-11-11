// Share a signal as an image (1.7.0): canvas 1080×1350 in the PULSE style.
// navigator.share with a file when the device supports it, otherwise the PNG is downloaded.
import { CONFIG } from '../config.js';
import * as F from './format.js';
import * as D from './domain.js';
import { t } from './i18n/index.js';

const W = 1080, H = 1350, PAD = 84;
const C = {
  bg: '#08090c', raise: '#111318', raise2: '#15171d', line: 'rgba(240,234,222,0.11)', line3: 'rgba(240,234,222,0.18)',
  ink: '#f3f0ea', ink2: '#a9a7a1', ink3: '#8a8984', gold: '#d9b779', goldHi: '#eed6a7',
  up: '#52c58b', upSoft: 'rgba(82,197,139,0.13)', down: '#ea6a60', downSoft: 'rgba(234,106,96,0.13)',
};
const FONT = "'Archivo', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const font = (wt, px, stretch = '100%') => `${stretch === '100%' ? '' : ''}${wt} ${px}px ${FONT}`;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxW, wt, px, min = 20) {
  let s = px;
  ctx.font = font(wt, s);
  while (s > min && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = font(wt, s); }
  return s;
}

function wrap(ctx, text, x, y, maxW, lh, maxLines = 3) {
  const words = String(text).split(/\s+/);
  let line = '', n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + n * lh); n++; line = words[i];
      if (n >= maxLines - 1) { line = words.slice(i).join(' '); break; }
    } else line = test;
  }
  if (line) {
    let l = line;
    while (ctx.measureText(l).width > maxW && l.length > 4) l = l.slice(0, -2);
    if (l !== line) l = l.replace(/\s*\S*$/, '') + '…';
    ctx.fillText(l, x, y + n * lh); n++;
  }
  return n;
}

function loadImg(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

const sample = 'ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽáčďéěíňóřšťúůýž0123456789+−%';
async function fontsReady() {
  try {
    await Promise.all([400, 500, 600, 700].map((w) => document.fonts.load(`${w} 40px Archivo`, sample)));
  } catch { /* system font fallback */ }
}

/* Draw the card; returns the canvas */
export async function drawSignal(s, now = D.clock()) {
  await fontsReady();
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const st = D.liveStatus(s, now);
  const toneC = st.tone === 'up' ? C.up : st.tone === 'down' ? C.down : C.gold;
  const buy = s.action !== 'SELL';

  /* background: deep black, champagne glow top right, tone glow bottom left */
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W - 120, 40, 0, W - 120, 40, 760);
  g.addColorStop(0, 'rgba(217,183,121,0.22)'); g.addColorStop(1, 'rgba(217,183,121,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(80, H - 160, 0, 80, H - 160, 720);
  g.addColorStop(0, st.tone === 'down' ? 'rgba(234,106,96,0.13)' : 'rgba(82,197,139,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  /* fine grid */
  ctx.strokeStyle = 'rgba(240,234,222,0.025)'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 54) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }

  /* header: logo + name, horizon chip on the right */
  const logo = await loadImg('./icons/icon-192.png');
  if (logo) { ctx.save(); rr(ctx, PAD, 78, 66, 66, 18); ctx.clip(); ctx.drawImage(logo, PAD, 78, 66, 66); ctx.restore(); }
  ctx.fillStyle = C.ink; ctx.font = font(600, 36); ctx.textBaseline = 'middle';
  ctx.fillText(CONFIG.APP_NAME, PAD + 86, 111);
  const hz = String(F.HZ_LABEL[s.horizon] || '').toUpperCase();
  if (hz) {
    ctx.font = font(600, 26);
    const hw = ctx.measureText(hz).width + 44;
    rr(ctx, W - PAD - hw, 89, hw, 46, 23); ctx.fillStyle = 'rgba(217,183,121,0.1)'; ctx.fill();
    ctx.strokeStyle = 'rgba(217,183,121,0.32)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = C.goldHi; ctx.textAlign = 'center'; ctx.fillText(hz, W - PAD - hw / 2, 112); ctx.textAlign = 'left';
  }

  /* ticker + action */
  ctx.textBaseline = 'alphabetic';
  const tk = String(s.symbol);
  const tkSize = fitText(ctx, tk, W - PAD * 2 - 330, 700, 168, 90);
  ctx.fillStyle = C.ink; ctx.font = font(700, tkSize);
  ctx.fillText(tk, PAD - 6, 360);
  const tkW = ctx.measureText(tk).width;
  const act = F.SIDE[s.action] || s.action;
  ctx.font = font(700, 34);
  const aw = ctx.measureText(act).width + 92;
  const ax = PAD + tkW + 28, ay = 360 - 74;
  rr(ctx, ax, ay, aw, 70, 35); ctx.fillStyle = buy ? C.upSoft : C.downSoft; ctx.fill();
  ctx.strokeStyle = buy ? 'rgba(82,197,139,0.4)' : 'rgba(234,106,96,0.4)'; ctx.lineWidth = 2; ctx.stroke();
  /* arrow */
  ctx.strokeStyle = buy ? C.up : C.down; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
  const cx = ax + 36, cy = ay + 35;
  ctx.beginPath();
  if (buy) { ctx.moveTo(cx - 9, cy + 9); ctx.lineTo(cx + 9, cy - 9); ctx.moveTo(cx - 4, cy - 9); ctx.lineTo(cx + 9, cy - 9); ctx.lineTo(cx + 9, cy + 4); }
  else { ctx.moveTo(cx - 9, cy - 9); ctx.lineTo(cx + 9, cy + 9); ctx.moveTo(cx + 9, cy - 4); ctx.lineTo(cx + 9, cy + 9); ctx.lineTo(cx - 4, cy + 9); }
  ctx.stroke();
  ctx.fillStyle = buy ? C.up : C.down; ctx.font = font(700, 34); ctx.textBaseline = 'middle';
  ctx.fillText(act, ax + 62, cy + 1);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ink2; ctx.font = font(400, 38);
  wrap(ctx, `${s.name || ''}${s.asset_class ? ` · ${F.CLASS_LABEL[s.asset_class]}` : ''}`, PAD, 428, W - PAD * 2, 46, 1);

  /* live status box */
  const by = 482, bh = 172;
  rr(ctx, PAD, by, W - PAD * 2, bh, 30);
  ctx.fillStyle = st.tone === 'up' ? C.upSoft : st.tone === 'down' ? C.downSoft : 'rgba(240,234,222,0.04)'; ctx.fill();
  ctx.strokeStyle = st.tone === 'up' ? 'rgba(82,197,139,0.32)' : st.tone === 'down' ? 'rgba(234,106,96,0.32)' : C.line; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(PAD + 50, by + 62, 10, 0, Math.PI * 2); ctx.fillStyle = toneC; ctx.fill();
  ctx.fillStyle = st.tone === 'flat' ? C.ink : toneC;
  const stSize = fitText(ctx, st.text, W - PAD * 2 - 110, 650, 46, 28);
  ctx.font = font(650, stSize); ctx.fillText(st.text, PAD + 80, by + 78);
  ctx.fillStyle = C.ink2; ctx.font = font(400, 31);
  const hint = [st.hint, t('share.at', { time: F.dmTime(s.last_price_at || now) })].filter(Boolean).join(' · ');
  wrap(ctx, hint, PAD + 80, by + 128, W - PAD * 2 - 110, 38, 1);

  /* entry / stop / target */
  const cy0 = 704, cw = (W - PAD * 2 - 32) / 3, ch = 196;
  const dist = (p) => (s.entry > 0 && p != null ? F.spct(((p - s.entry) / s.entry) * 100, 1) : '');
  const cols = [
    { l: t('share.entry'), v: F.price(s.entry), c: C.ink, sub: t(buy ? 'lad.buy' : 'lad.sell') },
    { l: t('share.stop'), v: F.price(s.stop), c: C.down, sub: dist(s.stop) },
    { l: t('share.target'), v: F.price(s.target), c: C.up, sub: dist(s.target) },
  ];
  cols.forEach((k, i) => {
    const x = PAD + i * (cw + 16);
    rr(ctx, x, cy0, cw, ch, 26); ctx.fillStyle = C.raise; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = C.ink3; ctx.font = font(500, 27); ctx.fillText(k.l.toUpperCase(), x + 28, cy0 + 52);
    ctx.fillStyle = k.c; const ps = fitText(ctx, k.v, cw - 56, 600, 58, 34); ctx.font = font(600, ps); ctx.fillText(k.v, x + 28, cy0 + 124);
    ctx.fillStyle = C.ink3; ctx.font = font(400, 27); ctx.fillText(k.sub, x + 28, cy0 + 168);
  });

  /* price bar: stop <- entry -> target with the current price */
  const ly = 966, lx = PAD, lw = W - PAD * 2;
  const left = buy ? s.stop : s.target, right = buy ? s.target : s.stop, span = (right - left) || 1;
  const pos = (p) => lx + Math.max(0, Math.min(1, (p - left) / span)) * lw;
  const ex = pos(s.entry);
  rr(ctx, lx, ly - 7, lw, 14, 7); ctx.fillStyle = 'rgba(240,234,222,0.06)'; ctx.fill();
  ctx.fillStyle = 'rgba(234,106,96,0.45)';
  if (buy) { rr(ctx, lx, ly - 7, ex - lx, 14, 7); } else { rr(ctx, ex, ly - 7, lx + lw - ex, 14, 7); } ctx.fill();
  ctx.fillStyle = 'rgba(82,197,139,0.45)';
  if (buy) { rr(ctx, ex, ly - 7, lx + lw - ex, 14, 7); } else { rr(ctx, lx, ly - 7, ex - lx, 14, 7); } ctx.fill();
  ctx.fillStyle = C.ink; ctx.fillRect(ex - 2, ly - 22, 4, 44);
  const px = st.done ? D.exitPrice(s) : s.last_price;
  if (px != null) {
    const cxp = pos(px);
    ctx.beginPath(); ctx.arc(cxp, ly, 19, 0, Math.PI * 2); ctx.fillStyle = C.bg; ctx.fill();
    ctx.beginPath(); ctx.arc(cxp, ly, 14, 0, Math.PI * 2); ctx.fillStyle = toneC; ctx.fill();
  }
  ctx.font = font(500, 26); ctx.fillStyle = C.ink3;
  ctx.fillText(t(buy ? 'share.stop' : 'share.target'), lx, ly + 58);
  ctx.textAlign = 'right'; ctx.fillText(t(buy ? 'share.target' : 'share.stop'), lx + lw, ly + 58);
  ctx.textAlign = 'center'; ctx.fillText(t('share.entry'), Math.max(lx + 120, Math.min(lx + lw - 120, ex)), ly + 58); ctx.textAlign = 'left';

  /* footer: issued date, disclaimer, URL */
  ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD, 1110); ctx.lineTo(W - PAD, 1110); ctx.stroke();
  ctx.fillStyle = C.ink2; ctx.font = font(500, 28);
  ctx.fillText(t('share.issued', { d: F.dmy(s.created_at || now) }), PAD, 1162);
  ctx.fillStyle = C.ink3; ctx.font = font(400, 24);
  wrap(ctx, t('share.disc'), PAD, 1206, W - PAD * 2, 32, 2);
  ctx.fillStyle = C.gold; ctx.font = font(600, 30);
  ctx.fillText(CONFIG.APP_URL.replace(/^https?:\/\//, '').replace(/\/$/, ''), PAD, 1296);
  return cv;
}

const toBlob = (cv) => new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* Returns 'shared' | 'downloaded' | 'cancelled' | 'failed' */
export async function shareSignal(s) {
  try {
    const cv = await drawSignal(s);
    const blob = await toBlob(cv);
    if (!blob) return 'failed';
    const name = `PULSE-${String(s.symbol).replace(/[^A-Z0-9.-]/gi, '')}-${F.dayKey(D.clock())}.png`;
    const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `${s.symbol} – ${CONFIG.APP_NAME}`, text: t('share.text', { sym: s.symbol, url: CONFIG.APP_URL }) });
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
        /* share refused (e.g. not allowed here) -> fall back to the download */
      }
    }
    download(blob, name);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
