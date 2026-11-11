// Static help pages (1.6.0): #/stahnout (install for everyone, QR code) and #/mt5 (PULSE and MetaTrader 5, demo).
import { CONFIG } from '../../config.js';
import * as F from '../format.js';
import * as P from '../pwa.js';
import { t } from '../i18n/index.js';
import { icon } from '../ui.js';
import { qrSvg, QR_URL } from '../qr.js';

const step = (n, html) => `<li><span class="stp-n num">${n}</span><span>${html}</span></li>`;

export function renderInstall() {
  const st = P.installState();
  const url = CONFIG.APP_URL || QR_URL;
  return `<header class="page-head"><div><a class="back" href="#/vice">${icon('chev-left', 'icon-xs')}${t('nav.vice')}</a><h1 class="page-title">${t('inst.title')}</h1><p class="page-sub">${t('inst.sub')}</p></div></header>
  <p class="headline">${t('inst.headline')}</p>
  <section class="inst-hero">
    <span class="aurora" aria-hidden="true"><i></i><i></i></span>
    <div class="inst-qr">${qrSvg('qr')}</div>
    <div class="inst-txt">
      <p class="inst-k">${t('inst.scan')}</p>
      <p class="inst-url num">${F.esc(url.replace(/^https:\/\//, '').replace(/\/$/, ''))}</p>
      <p class="inst-s">${t('inst.scanS')}</p>
      ${st === 'prompt' ? `<button class="btn btn-primary btn-small" type="button" data-action="install">${t('nudge.install')}</button>` : st === 'installed' ? `<p class="inst-ok">${icon('check', 'icon-xs')}${t('set.installed')}</p>` : ''}
    </div>
  </section>
  <div class="inst-grid">
    <section class="card inst-card"><p class="inst-os">${icon('home', 'icon-sm')}${t('inst.android')}</p><ol class="stp">
      ${step(1, t('inst.a1'))}${step(2, t('inst.a2'))}${step(3, t('inst.a3'))}</ol></section>
    <section class="card inst-card"><p class="inst-os">${icon('share', 'icon-sm')}${t('inst.ios')}</p><ol class="stp">
      ${step(1, t('inst.i1'))}${step(2, t('inst.i2'))}${step(3, t('inst.i3'))}</ol>
      <p class="why-s">${t('inst.iosPush')}</p></section>
    <section class="card inst-card"><p class="inst-os">${icon('plus-square', 'icon-sm')}${t('inst.pc')}</p><ol class="stp">
      ${step(1, t('inst.p1'))}${step(2, t('inst.p2'))}${step(3, t('inst.p3'))}</ol></section>
  </div>
  <p class="honest">${icon('info', 'icon-xs')} ${t('inst.foot')}</p>`;
}

export function renderMt5() {
  return `<header class="page-head"><div><a class="back" href="#/vice">${icon('chev-left', 'icon-xs')}${t('nav.vice')}</a><h1 class="page-title">${t('mt5.title')}</h1><p class="page-sub">${t('mt5.sub')}</p></div></header>
  <p class="headline">${t('mt5.headline')}</p>
  <section class="card">
    <p class="card-t">${t('mt5.what')}</p>
    <p class="card-s">${t('mt5.whatS')}</p>
  </section>
  <h2 class="section-title">${t('mt5.steps')}</h2>
  <section class="card"><ol class="stp">
    ${step(1, t('mt5.s1'))}${step(2, t('mt5.s2'))}${step(3, t('mt5.s3'))}${step(4, t('mt5.s4'))}
  </ol>
  <div class="btn-stack" style="margin-top:16px">
    <a class="btn btn-primary btn-block" href="${CONFIG.MT5.DOWNLOAD_URL}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}${t('mt5.open')}</a>
    ${CONFIG.MT5.EA_URL ? `<a class="btn btn-secondary btn-block" href="${CONFIG.MT5.EA_URL}">${t('mt5.ea')}</a>` : `<button class="btn btn-secondary btn-block btn-two-line" type="button" disabled><span class="btn-line">${t('mt5.ea')}</span><span class="btn-note">${t('mt5.soon')}</span></button>`}
  </div></section>
  <p class="honest">${icon('info', 'icon-xs')} ${t('mt5.demoOnly')}</p>
  <p class="disclaimer">${icon('info')}${F.esc(t('disclaimer'))}</p>`;
}
