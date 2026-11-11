// Akademie – 10 short lessons. Texts live in js/i18n/<lang>.js under "lessons".
// Facts checked: ESMA retail leverage caps, 50 % margin close-out, negative
// balance protection (EU retail), break-even win rate = 1 / (1 + RR),
// P(run of >= 5 losses in 100 trades at 50 %) ≈ 81 % (simulated).
import { tr } from './i18n/index.js';

const MIN = [2, 2, 3, 3, 3, 3, 2, 2, 2, 3];
export const LESSONS = MIN.map((min, i) => ({ id: i + 1, min }));

export function lessonText(id) {
  const all = tr('lessons') || [];
  return all[id - 1] || { title: '', body: [], key: '' };
}
