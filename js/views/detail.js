import { CONFIG } from '../../config.js';
import * as F from '../format.js';
import * as D from '../domain.js';
import { t, L } from '../i18n/index.js';
import { icon, ladder, pill, openSheet, closeTopSheet, toast, copyText, liveState, ring, monogram } from '../ui.js';
import { priceChart } from '../charts.js';
import { rTip, entryChip } from './signals.js';
import { vtSupported } from '../motion.js';

let chartRef = null;

export function openDetail(ctx, id, sourceEl = null) {
  const s = D.findSignal(ctx.data, id);
  if (!s) { toast(t('det.notFound')); return; }
  const now = ctx.now();
  const isOpen = s.status === 'open';
  let state = liveState(s);
  if (state === 'open' && D.isTimeExit(s, now)) state = 'time_exit';
  const events = D.eventsFor(s, ctx.data.calendar?.events || []);
  const ex = s.explanation;
  const left = F.daysUntil(s.exit_date, now);
  const created = F.toDate(s.created_at), exit = F.toDate(s.exit_date + 'T22:00:00');
  const elapsed = Math.max(0, Math.min(100, ((now - created) / (exit - created)) * 100));
  const up = (s.pnl_r ?? s.result_r ?? 0) >= 0;
  const showR = D.showR(ctx.data);
  const R = (v) => (showR ? rTip(v) : '');
  const est = D.entryState(s, now);
  const risk = D.riskFor(s);
  const lev = D.leverageInfo(ctx.data, s);
  const lines = D.orderLines(s);
  const prox = D.proximity(s);
  const hitKey = { target: 'sig.hit.target', stop: 'sig.hit.stop', time_exit: 'det.timeExit' };

  let status = '';
  if (isOpen && state === 'open' && s.last_price != null) {
    status = `<div class="live-row">
      <div><p class="kv-l">${t('det.price')}</p><p class="live-price num">${F.price(s.last_price)}</p><p class="kv-l">${F.ago(s.last_price_at, now)}</p></div>
      <div class="pnl ${up ? 'up' : 'down'}"><p class="kv-l">${t('det.robotFromEntry')}</p><div class="pnl-pct num">${F.spct(s.pnl_pct_position, 2)}</div>${showR ? `<div class="pnl-r num">${R(s.pnl_r)}</div>` : ''}</div>
    </div>`;
  } else if (isOpen) {
    status = `<div class="result-banner ${state === 'target' ? 'up' : state === 'stop' ? 'down' : ''}">
      <div><p class="kv-l">${t(hitKey[state])}${s.hit_at ? t('sig.hit.at', { time: F.time(s.hit_at) }) : ''}</p><p class="big num">${F.spct(s.pnl_pct_position, 2)}</p></div>
      ${showR ? `<div style="text-align:right"><p class="kv-l">${t('det.inR')}</p><p class="mid num">${R(s.pnl_r)}</p></div>` : ''}</div>`;
  } else {
    status = `<div class="result-banner ${s.result_r > 0 ? 'up' : s.result_r < 0 ? 'down' : ''}">
      <div><p class="kv-l">${t('det.robotAcc', { status: F.STATUS_LABEL[s.status], date: s.closed_at ? F.dm(s.closed_at) : '' })}</p><p class="big num">${F.spct(s.result_pct, 2)}</p></div>
      ${showR ? `<div style="text-align:right"><p class="kv-l">${t('det.inR')}</p><p class="mid num">${R(s.result_r)}</p></div>` : ''}</div>`;
  }

  const j = D.journal()[s.id];
  const html = `
    <div class="sheet-head">
      <div class="sheet-id">${monogram(s.symbol, s.name)}<div><div class="sig-tl"><span class="ticker" data-vt="ticker">${F.esc(s.symbol)}</span>${pill(s.action)}</div>
        <p class="sheet-sub">${F.esc(s.name)}, ${F.CLASS_LABEL[s.asset_class] || ''}, ${F.HZ_LABEL[s.horizon]}</p></div></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button>
    </div>
    <div class="sheet-body">
      ${status}
      ${est ? `<div class="entry-box is-${est.code}">${entryChip(est)}<p>${F.esc(est.note)}</p></div>` : ''}
      ${prox ? `<p class="prox-line ${prox.side === 'stop' ? 'down' : 'up'}">${icon('alert', 'icon-xs')}${t('det.prox', { v: F.pct(prox.dist, 1), side: t(`det.prox.${prox.side}`) })}</p>` : ''}
      ${s.price_path?.length > 1 ? `<div class="pchart"><div class="pchart-box" id="pchart"></div>
        ${isOpen && state === 'open' ? `<p class="pchart-note">${left > 0 ? t('det.left', { n: left }) : left === 0 ? t('det.exitToday') : t('det.exitPassed')}</p>` : ''}</div>` : ''}
      <div data-vt="ladder">${ladder(s, { large: true, exitPrice: isOpen ? null : D.exitPrice(s) })}</div>
      ${isOpen && state === 'open' ? `<section class="howto" aria-label="${t('det.howto.aria')}">
        <div class="howto-head"><h3 class="howto-t">${t('det.howto')}</h3><button class="btn btn-secondary btn-small" type="button" data-copy-order>${icon('copy', 'icon-sm')}${t('common.copy')}</button></div>
        <ol class="howto-l num">${lines.map((l) => `<li>${F.esc(l)}</li>`).join('')}</ol>
        ${est && (est.code === 'late' || est.code === 'expired') ? `<p class="howto-warn">${t('det.howto.warn')}</p>` : ''}
      </section>` : ''}
      <div class="kv">
        <div class="kv-item"><p class="kv-l">${t('det.yourRisk')}</p><p class="kv-v num">${F.pct(risk.risk)}</p><p class="kv-s">${risk.profile ? t('det.byProfile', { p: F.esc(risk.profile.toLowerCase()) }) : t('det.botSuggest')}</p></div>
        <div class="kv-item"><p class="kv-l">${t('det.yourTarget')}</p><p class="kv-v num up">${F.spct(risk.target)}</p><p class="kv-s">${t('det.targetHit')}</p></div>
        <div class="kv-item"><p class="kv-l">${t('det.rr')}</p><p class="kv-v num">${F.rr(s.rr)}</p><p class="kv-s">${t('det.rrS', { v: F.num(s.rr, 1) })}</p></div>
        <div class="kv-item"><p class="kv-l">${t('det.lev')}</p><p class="kv-v num">${t('det.levMax', { v: lev.effective })}</p><p class="kv-s">${t('lev.text', { legal: lev.legal, level: lev.level })}</p></div>
      </div>
      ${isOpen && state === 'open' ? `<div class="exit-ring">
        ${ring(elapsed / 100, left > 0 ? `<b class="num">${left}</b><small>${F.unit('day', left)}</small>` : `<b>${t('det.todayShort')}</b>`, { size: 72, stroke: 5, cls: 'gold' })}
        <div class="timeline-row"><div>${t('det.exitLatest')}<b class="num">${F.dm(s.exit_date)} ${F.weekday(s.exit_date)}</b></div><div>${t('det.created')}<b class="num">${F.dmTime(s.created_at)}</b></div></div>
      </div>` : `<div class="timeline"><div class="timeline-row"><div>${t('det.created')}<b class="num">${F.dmTime(s.created_at)}</b></div><div>${t('det.exitLatest')}<b class="num">${F.dm(s.exit_date)} ${F.weekday(s.exit_date)}</b></div></div></div>`}
      ${events.length ? `<div class="callout warn">${icon('calendar')}<div>${t('det.events', { list: events.map((e) => `${F.esc(L(e.title))} (${F.dm(e.date)}${e.time ? ` ${e.time}` : ''})`).join(', ') })}</div></div>` : ''}

      <h3 class="sheet-label">${t('det.why')}</h3>
      ${ex?.summary ? `<p class="why">${F.esc(L(ex.summary))}</p>` : ''}
      ${ex?.strategies?.length ? `<p class="why-l">${t('det.strategies')}</p><div class="chips" style="margin-top:8px">${ex.strategies.map((x) => `<span class="chip chip-gold">${F.esc(L(x))}</span>`).join('')}</div>` : ''}
      <ul class="reasons">${(s.reasons || []).map((r) => `<li>${icon('check')}${F.esc(L(r))}</li>`).join('')}</ul>
      ${ex?.expect || ex?.invalidation ? `<div class="why-grid">
        ${ex.expect ? `<div><p class="why-l">${t('det.expect')}</p><p>${F.esc(L(ex.expect))}</p></div>` : ''}
        ${ex.invalidation ? `<div><p class="why-l">${t('det.invalid')}</p><p>${F.esc(L(ex.invalidation))}</p></div>` : ''}
      </div>` : ''}

      <h3 class="sheet-label">${t('det.journal')}</h3>
      <div class="journal-box" id="jbox">${journalForm(s, j)}</div>

      <div class="sheet-actions btn-stack">
        ${isOpen && state === 'open' ? `<a class="btn btn-primary btn-block" href="#/kalkulacka?s=${encodeURIComponent(s.id)}" data-close-nav>${t('det.calcBtn')}</a>` : ''}
        ${isOpen && state === 'open' ? brokerButton() : ''}
      </div>
    </div>`;

  const mount = (el) => {
    el.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
    const box = el.querySelector('#pchart');
    if (box) setTimeout(() => { chartRef = priceChart(box, s); }, 30);
    el.querySelector('[data-close-nav]')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      const href = ev.currentTarget.getAttribute('href');
      closeTopSheet();
      setTimeout(() => { (window.__pulseGo ? window.__pulseGo(href) : (location.hash = href)); }, 380);
    });
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-j]');
      if (b) onJournal(el, s, b.dataset.j);
      if (ev.target.closest('[data-broker]')) openBroker(ctx, s);
      if (ev.target.closest('[data-copy-order]')) {
        copyText(`${s.symbol} ${F.SIDE[s.action]}\n${lines.join('\n')}`).then((ok) => toast(ok ? t('det.howto.copied') : t('common.copyFailed')));
      }
    });
  };
  const opts = { html, label: t('det.aria', { sym: s.symbol }), onMount: mount, onClose() { chartRef && chartRef.destroy(); chartRef = null; ctx.rerender({ soft: true }); } };

  // Shared-element morph: card ticker + ladder -> sheet (View Transitions API)
  const srcTicker = sourceEl?.querySelector?.('.ticker');
  const srcLadder = sourceEl?.querySelector?.('.ladder');
  if (vtSupported() && srcTicker && srcLadder) {
    srcTicker.style.viewTransitionName = 'vt-ticker';
    srcLadder.style.viewTransitionName = 'vt-ladder';
    const vt = document.startViewTransition(() => {
      srcTicker.style.viewTransitionName = '';
      srcLadder.style.viewTransitionName = '';
      const el = openSheet({ ...opts, instant: true });
      el.querySelector('[data-vt="ticker"]').style.viewTransitionName = 'vt-ticker';
      el.querySelector('[data-vt="ladder"] .ladder').style.viewTransitionName = 'vt-ladder';
    });
    vt.ready?.catch(() => {}); vt.updateCallbackDone?.catch(() => {});
    vt.finished.catch(() => {}).finally(() => {
      document.querySelectorAll('.sheet [data-vt="ticker"], .sheet [data-vt="ladder"] .ladder').forEach((n) => { n.style.viewTransitionName = ''; });
    });
    return;
  }
  openSheet(opts);
}

function journalForm(s, j) {
  const st = j?.state || null;
  return `<div class="jchoice" role="radiogroup" aria-label="${t('det.journal')}">
      <button type="button" class="jbtn" role="radio" aria-checked="${st === 'in'}" data-j="in">${icon('check', 'icon-sm')}${t('j.in')}</button>
      <button type="button" class="jbtn" role="radio" aria-checked="${st === 'out'}" data-j="out">${icon('close', 'icon-sm')}${t('j.out')}</button>
    </div>
    ${st === 'in' ? `<div class="jform">
      <label><span>${t('j.myEntry')}</span><input class="jin num" inputmode="decimal" id="j-entry" value="${F.esc(F.num(j.entry || s.entry, 2).replace(/−/, '-'))}"></label>
      <label><span>${t('j.size', { ccy: D.calcState().ccy })}</span><input class="jin num" inputmode="decimal" id="j-size" value="${F.esc(j.size ? String(Math.round(j.size)) : '')}" placeholder="${t('j.sizePh')}"></label>
      <button type="button" class="btn btn-secondary btn-small" data-j="save">${t('common.save')}</button>
    </div>` : ''}
    <p class="jnote">${t('j.local')}</p>`;
}

function onJournal(el, s, what) {
  const box = el.querySelector('#jbox');
  const cur = D.journal()[s.id];
  if (what === 'in') {
    D.setJournal(s.id, { state: 'in', entry: cur?.entry || s.entry, size: cur?.size || null, ccy: D.calcState().ccy });
  } else if (what === 'out') {
    if (cur?.state === 'out') D.setJournal(s.id, null); else D.setJournal(s.id, { state: 'out' });
  } else if (what === 'save') {
    const entry = F.parseNum(el.querySelector('#j-entry').value);
    const size = F.parseNum(el.querySelector('#j-size').value);
    if (!(entry > 0)) { toast(t('j.badEntry')); return; }
    D.setJournal(s.id, { state: 'in', entry, size: size > 0 ? size : null, ccy: D.calcState().ccy });
    toast(t('j.saved'));
  }
  box.innerHTML = journalForm(s, D.journal()[s.id]);
}

function brokerButton() {
  if (!CONFIG.BROKER_HANDOFF_ENABLED) {
    return `<button class="btn btn-secondary btn-block btn-two-line" type="button" disabled aria-disabled="true"><span class="btn-line">${icon('external', 'icon-sm')}${t('broker.btn')}</span><span class="btn-note">${t('broker.soon')}</span></button>`;
  }
  return `<button class="btn btn-secondary btn-block" type="button" data-broker>${t('broker.btnOn')}</button>`;
}

function openBroker(ctx, s) {
  const cs = D.calcState();
  const prof = CONFIG.CALC.RISK_PROFILES.find((p) => p.id === cs.profile);
  const lev = Math.min(cs.leverage, D.leverageCap(ctx.data, s));
  const pos = D.computePosition(s, { account: cs.account, ccy: cs.ccy, leverage: lev, riskPct: prof.pct, fx: D.fxRates(ctx.data) });
  const summary = [
    `${s.symbol} (${s.name})`,
    t('sum.side', { v: t(`side.${s.action}.long`) }),
    t('sum.entry', { v: F.price(s.entry) }),
    t('sum.size', { units: F.num(pos.units, 2), money: F.money(pos.notional, cs.ccy) }),
    t('sum.stop', { v: F.price(s.stop) }),
    t('sum.target', { v: F.price(s.target) }),
    t('sum.exit', { v: F.dm(s.exit_date) }),
  ].join('\n');
  let pick = null;
  openSheet({
    small: true, label: t('broker.title'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('broker.title')}</p><p class="sheet-sub">${t('broker.sub')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body">
        <div class="broker-list">${CONFIG.BROKERS.map((b) => `<button type="button" class="broker" data-b="${b.id}" aria-pressed="false"><span>${F.esc(b.name)}<small>${t(b.instrument_url ? 'broker.deep' : 'broker.copyOpen')}</small></span>${icon('chev-right', 'icon-sm')}</button>`).join('')}</div>
        <pre class="order-summary num">${F.esc(summary)}</pre>
        <div class="btn-stack" style="margin-top:16px">
          <button class="btn btn-primary btn-block" type="button" data-go disabled>${t('broker.pick')}</button>
          <button class="btn btn-ghost" type="button" data-copy>${icon('copy', 'icon-sm')}${t('broker.copyOnly')}</button>
        </div>
        <p class="jnote" style="margin-top:12px">${t('broker.safe')}</p>
      </div>`,
    onMount(el) {
      el.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      const go = el.querySelector('[data-go]');
      el.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', () => {
        pick = CONFIG.BROKERS.find((x) => x.id === b.dataset.b);
        el.querySelectorAll('[data-b]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        go.disabled = false; go.textContent = t('broker.go', { name: pick.name });
      }));
      el.querySelector('[data-copy]').addEventListener('click', async () => {
        const ok = await copyText(summary);
        toast(ok ? t('broker.copied') : t('common.copyFailed'));
      });
      go.addEventListener('click', async () => {
        if (!pick) return;
        const ok = await copyText(summary);
        toast(ok ? t('broker.opening', { name: pick.name }) : t('broker.openingNo', { name: pick.name }));
        const url = pick.instrument_url ? pick.instrument_url.replace('{symbol}', encodeURIComponent(s.symbol)).replace('{side}', s.action.toLowerCase()) : pick.open_url;
        window.open(url, '_blank', 'noopener');
      });
    },
  });
}
