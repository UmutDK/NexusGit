import { Injectable, signal } from '@angular/core';
import type { RecurrenceUnit, TaskRecurrence } from '../models';

const STORAGE_KEY = 'nexus_task_recurrences_mock_v1';

/**
 * Stands in for the backend recurrence API, which doesn't exist yet. A rule only
 * describes the cadence ("every N days/weeks/months") — actually creating the next
 * task instance or firing a reminder on schedule needs a server-side job that runs
 * even when nobody has the app open, which this mock can't provide. That part is
 * documented for the backend team; this service only covers the rule itself and
 * the "next occurrence" preview, following the same mock pattern as
 * ChecklistService/TaskLinkService (localStorage, swappable for real HTTP calls to
 * PUT/DELETE /tasks/{id}/recurrence later).
 */
@Injectable({ providedIn: 'root' })
export class TaskRecurrenceService {
  readonly rules = signal<TaskRecurrence[]>(this.load());

  constructor() {
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        this.rules.set(this.parse(event.newValue));
      }
    });
  }

  ruleForTask(taskId: string): TaskRecurrence | null {
    return this.rules().find((r) => r.taskId === taskId) ?? null;
  }

  setRule(taskId: string, interval: number, unit: RecurrenceUnit): void {
    const safeInterval = Math.max(1, Math.round(interval));
    const existing = this.rules().some((r) => r.taskId === taskId);
    const list = existing
      ? this.rules().map((r) => (r.taskId === taskId ? { ...r, interval: safeInterval, unit } : r))
      : [...this.rules(), { taskId, interval: safeInterval, unit }];
    this.persist(list);
  }

  clearRule(taskId: string): void {
    this.persist(this.rules().filter((r) => r.taskId !== taskId));
  }

  private persist(list: TaskRecurrence[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    this.rules.set(list);
  }

  private load(): TaskRecurrence[] {
    return this.parse(localStorage.getItem(STORAGE_KEY));
  }

  private parse(raw: string | null): TaskRecurrence[] {
    if (!raw) {
      return [];
    }
    try {
      return JSON.parse(raw) as TaskRecurrence[];
    } catch {
      return [];
    }
  }
}
