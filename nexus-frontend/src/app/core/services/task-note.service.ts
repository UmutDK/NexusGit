import { Injectable, signal } from '@angular/core';
import type { TaskNote } from '../models';

const STORAGE_KEY = 'nexus_task_notes_mock_v1';

/**
 * Stands in for the backend notes API, which doesn't exist yet. One free-text note
 * per task (like Description, not a comment thread), stored in localStorage,
 * following the same mock pattern as ChecklistService/TaskLinkService. Swapping
 * this for a real HTTP call (PUT /tasks/{id}/note) is the intended migration path
 * once that API exists.
 */
@Injectable({ providedIn: 'root' })
export class TaskNoteService {
  readonly notes = signal<TaskNote[]>(this.load());

  constructor() {
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        this.notes.set(this.parse(event.newValue));
      }
    });
  }

  noteForTask(taskId: string): TaskNote | null {
    return this.notes().find((n) => n.taskId === taskId) ?? null;
  }

  saveNote(taskId: string, text: string): void {
    const updatedAt = new Date().toISOString();
    const existing = this.notes().some((n) => n.taskId === taskId);
    const list = existing
      ? this.notes().map((n) => (n.taskId === taskId ? { ...n, text, updatedAt } : n))
      : [...this.notes(), { taskId, text, updatedAt }];
    this.persist(list);
  }

  private persist(list: TaskNote[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    this.notes.set(list);
  }

  private load(): TaskNote[] {
    return this.parse(localStorage.getItem(STORAGE_KEY));
  }

  private parse(raw: string | null): TaskNote[] {
    if (!raw) {
      return [];
    }
    try {
      return JSON.parse(raw) as TaskNote[];
    } catch {
      return [];
    }
  }
}
