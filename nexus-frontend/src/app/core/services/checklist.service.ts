import { Injectable, computed, signal } from '@angular/core';
import type { ChecklistItem } from '../models';

const STORAGE_KEY = 'nexus_checklist_items_mock_v1';

export interface ChecklistProgress {
  done: number;
  total: number;
  ratio: number;
}

const EMPTY_PROGRESS: ChecklistProgress = { done: 0, total: 0, ratio: 0 };

/**
 * Stands in for the backend to-do list API, which doesn't exist yet. Items live
 * in localStorage (shared instantly across tabs of this same browser profile via
 * the native `storage` event), following the same mock pattern as
 * TimeTrackingService. Swapping this for real HTTP calls (GET/POST
 * /tasks/{id}/checklist-items, PATCH/DELETE /checklist-items/{id}) is the intended
 * migration path once that API exists.
 */
@Injectable({ providedIn: 'root' })
export class ChecklistService {
  readonly items = signal<ChecklistItem[]>(this.load());

  constructor() {
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        this.items.set(this.parse(event.newValue));
      }
    });
  }

  itemsForTask(taskId: string): ChecklistItem[] {
    return this.items()
      .filter((i) => i.taskId === taskId)
      .sort((a, b) => a.position - b.position);
  }

  progressForTask(taskId: string): ChecklistProgress {
    const items = this.itemsForTask(taskId);
    if (items.length === 0) {
      return EMPTY_PROGRESS;
    }
    const done = items.filter((i) => i.completed).length;
    return { done, total: items.length, ratio: done / items.length };
  }

  addItem(taskId: string, label: string): void {
    const trimmed = label.trim();
    if (!trimmed) {
      return;
    }
    const lastPosition = this.itemsForTask(taskId).reduce((max, i) => Math.max(max, i.position), 0);
    const item: ChecklistItem = {
      id: crypto.randomUUID(),
      taskId,
      label: trimmed,
      completed: false,
      position: lastPosition + 1,
    };
    this.persist([...this.items(), item]);
  }

  toggleItem(itemId: string): void {
    this.persist(this.items().map((i) => (i.id === itemId ? { ...i, completed: !i.completed } : i)));
  }

  deleteItem(itemId: string): void {
    this.persist(this.items().filter((i) => i.id !== itemId));
  }

  private persist(list: ChecklistItem[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    this.items.set(list);
  }

  private load(): ChecklistItem[] {
    return this.parse(localStorage.getItem(STORAGE_KEY));
  }

  private parse(raw: string | null): ChecklistItem[] {
    if (!raw) {
      return [];
    }
    try {
      return JSON.parse(raw) as ChecklistItem[];
    } catch {
      return [];
    }
  }
}
