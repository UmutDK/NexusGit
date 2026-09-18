import type { RecurrenceUnit } from '../../core/models';

function advance(date: Date, interval: number, unit: RecurrenceUnit): Date {
  const next = new Date(date);
  if (unit === 'day') {
    next.setDate(next.getDate() + interval);
  } else if (unit === 'week') {
    next.setDate(next.getDate() + interval * 7);
  } else {
    next.setMonth(next.getMonth() + interval);
  }
  return next;
}

/** Rolls `anchor` forward by whole steps of `interval`/`unit` until it lands after `from`. */
export function nextOccurrence(anchor: Date, interval: number, unit: RecurrenceUnit, from = new Date()): Date {
  let next = new Date(anchor);
  while (next <= from) {
    next = advance(next, interval, unit);
  }
  return next;
}

const UNIT_LABELS: Record<RecurrenceUnit, { singular: string; plural: string; feminine: boolean }> = {
  day: { singular: 'jour', plural: 'jours', feminine: false },
  week: { singular: 'semaine', plural: 'semaines', feminine: true },
  month: { singular: 'mois', plural: 'mois', feminine: false },
};

export function formatRecurrence(interval: number, unit: RecurrenceUnit): string {
  const { singular, plural, feminine } = UNIT_LABELS[unit];
  const every = feminine ? 'Toutes les' : 'Tous les';
  if (interval === 1) {
    return `${every} ${singular === 'mois' ? 'mois' : plural}`;
  }
  return `${every} ${interval} ${plural}`;
}
