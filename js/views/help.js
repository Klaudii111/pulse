// 1.9.0 – two plain help pages:
//  #/jak    "Jak PULSE funguje": 1.10.0 – 4 big steps (Vyber signál · Vlož fiktivní částku · Robot hlídá · Výsledek), colours, 6 questions.
//  #/duvera "Jak víte, že si to nevymýšlíme": timestamps, all results incl. losses, named price sources,
//           verify on TradingView, the robot on a real broker's paper account; public archive = only "brzy".
import * as F from '../format.js';
import { t } from '../i18n/index.js';
import { icon } from '../ui.js';

const back = () => `<a class="back" href="#/vice">${icon('chev-left', 'icon-xs')}${t('nav.vice')}</a>`;

/* 1.10.0: the same 4 steps as a compact strip (onboarding) */
export function howStrip() {
  return `<ol class="how-strip">${[1, 2, 3, 4].map((n) => `<li><span class="how-n num">${n}</span><span>${t(`jak.n${n}.t`)}</span></li>`).join('')}</ol>`;
}

export function renderHow() {
  const steps = [1, 2, 3, 4].map((n) => `<li class="how-step is-big"><span class="how-n num">${n}</span><div><p class="how-t">${t(`jak.n${n}.t`)}</p><p class="how-s">${t(`jak.n${n}.s`)}</p></div></li>`).join('');
  const col = [['up', 'jak.c.up'], ['down', 'jak.c.down'], ['gold', 'jak.c.gold'], ['flat', 'jak.c.flat']]
    .map(([c, k]) => `<li class="how-col"><i class="dot-${c}" aria-hidden="true"></i><span>${t(k)}</span></li>`).join('');
  const faq = [4, 5, 6, 1, 3].map((n) => `<details class="faq"><summary>${t(`jak.q${n}`)}</summary><p>${t(`jak.a${n}`)}</p></details>`).join('');
  return `<header class="page-head"><div>${back()}<h1 class="page-title">${t('jak.title')}</h1><p class="page-sub">${t('jak.sub')}</p></div></header>
  <ol class="how-flow">${steps}</ol>
  <div class="btn-stack how-btns"><button type="button" class="btn btn-primary btn-block" data-action="tour">${icon('help', 'icon-sm')}${t('jak.tour')}</button>
    <a class="btn btn-secondary btn-block" href="#/terminal">${icon('chart', 'icon-sm')}${t('u.acc.trade')}</a></div>
  <h2 class="section-title">${t('jak.colors')}</h2>
  <ul class="how-cols card">${col}</ul>
  <h2 class="section-title">${t('jak.faq')}</h2>
  <div class="faq-list">${faq}</div>
  <p class="honest">${icon('shield', 'icon-xs')} <a class="link" href="#/duvera">${t('trust.title')}</a></p>
  <p class="disclaimer">${icon('info')}${F.esc(t('disclaimer'))}</p>`;
}

export function renderTrust() {
  const pts = [1, 2, 3, 4, 5].map((n) => `<li class="how-step"><span class="how-n">${icon(['clock', 'results', 'chart', 'external', 'shield'][n - 1], 'icon-sm')}</span><div><p class="how-t">${t(`trust.p${n}.t`)}</p><p class="how-s">${t(`trust.p${n}.s`)}</p></div></li>`).join('');
  return `<header class="page-head"><div>${back()}<h1 class="page-title">${t('trust.title')}</h1><p class="page-sub">${t('trust.sub')}</p></div></header>
  <ol class="how-flow trust-flow">${pts}</ol>
  <section class="card trust-soon"><p class="card-t">${icon('clock', 'icon-xs')} ${t('trust.soon.t')}</p><p class="card-s">${t('trust.soon.s')}</p></section>
  <div class="btn-stack how-btns"><a class="btn btn-secondary btn-block" href="#/vysledky">${icon('results', 'icon-sm')}${t('trust.res')}</a><a class="btn btn-ghost btn-block" href="#/robot">${icon('shield', 'icon-sm')}${t('trust.robot')}</a></div>
  <p class="disclaimer">${icon('info')}${F.esc(t('disclaimer'))}</p>`;
}
