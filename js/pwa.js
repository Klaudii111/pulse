// Service worker, install prompt, push subscription, local notifications.
import { CONFIG } from '../config.js';
import * as store from './store.js';
import { toast } from './ui.js';
import { t, lang } from './i18n/index.js';

let deferredPrompt = null;
const listeners = new Set();
export const onInstallChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((f) => f());

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const isIOS = () => {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
};

export function installState() {
  if (isStandalone()) return 'installed';
  if (deferredPrompt) return 'prompt';
  if (isIOS()) return 'ios';
  return 'unsupported';
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice.catch(() => null);
  deferredPrompt = null;
  emit();
  return choice && choice.outcome === 'accepted';
}

export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    store.set('installed', true);
    toast(t('install.done'));
    emit();
  });
}

export const nudgeDismissed = () => {
  const t = store.get('nudgeDismissedAt', 0);
  return Date.now() - t < 14 * 86400000;
};
export const dismissNudge = () => store.set('nudgeDismissedAt', Date.now());

/* ---------- Service worker ---------- */
let swReg = null;
export const registration = () => swReg;

export async function initSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    swReg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    // Zero-touch updates: a new version activates by itself and the app reloads (no button for the user).
    const applyUpdate = (worker) => { try { worker.postMessage({ type: 'SKIP_WAITING' }); } catch { /* ignore */ } };
    if (swReg.waiting && navigator.serviceWorker.controller) applyUpdate(swReg.waiting);
    swReg.addEventListener('updatefound', () => {
      const nw = swReg.installing;
      nw && nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) applyUpdate(nw);
      });
    });
    const check = () => { try { swReg.update(); } catch { /* offline */ } };
    setInterval(check, 30 * 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    let reloaded = false;
    /* 1.13.1: the very first install takes control of the page (clients.claim) – that is not an update: no reload, no toast */
    let hadCtl = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadCtl) { hadCtl = true; return; }
      if (reloaded) return; reloaded = true;
      try { sessionStorage.setItem('pulse.updated', '1'); } catch { /* ignore */ }
      location.reload();
    });
    return swReg;
  } catch (e) {
    console.warn('SW registration failed', e);
    return null;
  }
}

/* ---------- Push ---------- */
export function pushSupport() {
  if (!CONFIG.PUSH.ENABLED) return { ok: false, reason: 'elsewhere' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    if (isIOS() && !isStandalone()) return { ok: false, reason: 'ios-install' };
    return { ok: false, reason: 'unsupported' };
  }
  if (!CONFIG.PUSH.VAPID_PUBLIC_KEY || CONFIG.PUSH.VAPID_PUBLIC_KEY.startsWith('REPLACE')) return { ok: false, reason: 'no-key' };
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
  return { ok: true };
}

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function pushSubscription() {
  try {
    const reg = swReg || (await navigator.serviceWorker?.ready);
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch { return null; }
}

export async function subscribePush() {
  const sup = pushSupport();
  if (!sup.ok) return sup;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'denied' };
  const reg = swReg || (await navigator.serviceWorker.ready);
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CONFIG.PUSH.VAPID_PUBLIC_KEY) });
  if (CONFIG.PUSH.SUBSCRIBE_URL) {
    /* the server must confirm, otherwise we do not pretend push is on */
    const r = await fetch(CONFIG.PUSH.SUBSCRIBE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub, lang: lang() }) }).catch(() => null);
    if (!r || !r.ok) { try { await sub.unsubscribe(); } catch { /* ignore */ } return { ok: false, reason: 'server' }; }
  }
  store.set('pushOn', true);
  document.dispatchEvent(new CustomEvent('pulse:wallet')); // register my open trades for push right away
  return { ok: true, sub };
}

/* 1.9.1: tell the server which play-money trades to watch for this device (push while the app is closed).
   Sent whenever the open trades change; a non-2xx answer keeps the local behaviour (checks while the app is open). */
let lastTrades = null;
export async function syncTrades(trades, force = false) {
  if (!CONFIG.PUSH?.TRADES_URL || !CONFIG.PUSH.ENABLED) return false;
  const sub = await pushSubscription();
  if (!sub) return false;
  const body = JSON.stringify({ endpoint: sub.endpoint, trades });
  if (!force && body === lastTrades) return true;
  try {
    const r = await fetch(CONFIG.PUSH.TRADES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (r.ok) { lastTrades = body; return true; }
  } catch { /* offline / no endpoint yet: local checks keep working */ }
  return false;
}

export async function unsubscribePush() {
  const sub = await pushSubscription();
  store.set('pushOn', false);
  if (!sub) return true;
  if (CONFIG.PUSH.TRADES_URL) await fetch(CONFIG.PUSH.TRADES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint, trades: [] }) }).catch(() => {});
  if (CONFIG.PUSH.UNSUBSCRIBE_URL) {
    await fetch(CONFIG.PUSH.UNSUBSCRIBE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  }
  return sub.unsubscribe();
}

/* ---------- Local notifications (client side, works without push server) ---------- */
export const localNotifyEnabled = () => store.get('localNotify', false);
export async function setLocalNotify(on) {
  if (on && 'Notification' in window && Notification.permission !== 'granted') {
    const p = await Notification.requestPermission().catch(() => 'denied');
    if (p !== 'granted') { store.set('localNotify', false); return false; }
  }
  store.set('localNotify', !!on);
  return !!on;
}

export async function notify(title, body, { tag, url = './#/dnes' } = {}) {
  // Always show in-app; system notification when allowed
  toast(`<b>${title}</b>&nbsp; ${body}`, { timeout: 6000 });
  if (!localNotifyEnabled() || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = swReg || (await navigator.serviceWorker.ready);
    await reg.showNotification(title, { body, tag, icon: './icons/icon-192.png', badge: './icons/badge-96.png', data: { url } });
  } catch { /* ignore */ }
}

/* Should the "Zapnout upozornění" call-to-action show? (not when already on, denied, or dismissed lately) */
export function pushCtaState() {
  const sup = pushSupport();
  if (store.get('pushOn', false) && 'Notification' in window && Notification.permission === 'granted') return null;
  if (Date.now() - store.get('pushCtaDismissedAt', 0) < 7 * 86400000) return null;
  if (sup.ok) return 'ok';
  if (sup.reason === 'ios-install') return 'ios';
  if (sup.reason === 'elsewhere') return 'elsewhere';
  return null;
}
export const dismissPushCta = () => store.set('pushCtaDismissedAt', Date.now());
