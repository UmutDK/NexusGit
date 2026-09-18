import { Injectable, signal } from '@angular/core';
import type { TaskLink } from '../models';

const STORAGE_KEY = 'nexus_task_links_mock_v1';

/**
 * Stands in for the backend links API, which doesn't exist yet. Items live in
 * localStorage (shared instantly across tabs of this same browser profile via the
 * native `storage` event), following the same mock pattern as ChecklistService and
 * TimeTrackingService. Swapping this for real HTTP calls (GET/POST
 * /tasks/{id}/links, DELETE /links/{id}) is the intended migration path once that
 * API exists.
 */
@Injectable({ providedIn: 'root' })
export class TaskLinkService {
  readonly links = signal<TaskLink[]>(this.load());

  constructor() {
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        this.links.set(this.parse(event.newValue));
      }
    });
  }

  linksForTask(taskId: string): TaskLink[] {
    return this.links().filter((l) => l.taskId === taskId);
  }

  addLink(taskId: string, name: string, url: string): void {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      return;
    }
    const normalizedUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
    const link: TaskLink = {
      id: crypto.randomUUID(),
      taskId,
      name: name.trim() || normalizedUrl,
      url: normalizedUrl,
    };
    this.persist([...this.links(), link]);
  }

  deleteLink(linkId: string): void {
    this.persist(this.links().filter((l) => l.id !== linkId));
  }

  private persist(list: TaskLink[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    this.links.set(list);
  }

  private load(): TaskLink[] {
    return this.parse(localStorage.getItem(STORAGE_KEY));
  }

  private parse(raw: string | null): TaskLink[] {
    if (!raw) {
      return [];
    }
    try {
      return JSON.parse(raw) as TaskLink[];
    } catch {
      return [];
    }
  }
}
