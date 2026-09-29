import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ToastService } from './toast.service';
import type { ChecklistItem, Task } from '../models';

export interface ChecklistProgress {
  done: number;
  total: number;
  ratio: number;
}

const EMPTY_PROGRESS: ChecklistProgress = { done: 0, total: 0, ratio: 0 };

/**
 * To-do list des tâches, adossée au backend. Les éléments d'une tâche sont chargés
 * à l'ouverture de son détail ; tant qu'ils ne le sont pas, la progression affichée
 * sur la carte vient des compteurs checklistTotal/checklistDone renvoyés avec la tâche.
 */
@Injectable({ providedIn: 'root' })
export class ChecklistService {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly apiUrl = environment.apiUrl;

  readonly items = signal<ChecklistItem[]>([]);
  private readonly loadedTaskIds = signal<ReadonlySet<string>>(new Set());

  constructor() {
    try {
      localStorage.removeItem('nexus_checklist_items_mock_v1');
    } catch {
      // Stockage indisponible : rien à nettoyer.
    }
  }

  itemsForTask(taskId: string): ChecklistItem[] {
    return this.items()
      .filter((i) => i.taskId === taskId)
      .sort((a, b) => a.position - b.position);
  }

  progressForTask(task: Task): ChecklistProgress {
    let total: number;
    let done: number;
    if (this.loadedTaskIds().has(task.id)) {
      const items = this.itemsForTask(task.id);
      total = items.length;
      done = items.filter((i) => i.completed).length;
    } else {
      total = task.checklistTotal ?? 0;
      done = task.checklistDone ?? 0;
    }
    return total === 0 ? EMPTY_PROGRESS : { done, total, ratio: done / total };
  }

  load(taskId: string): void {
    this.http.get<ChecklistItem[]>(`${this.apiUrl}/tasks/${taskId}/checklist-items`).subscribe({
      next: (list) => {
        this.items.update((all) => [...all.filter((i) => i.taskId !== taskId), ...list]);
        this.loadedTaskIds.update((ids) => new Set(ids).add(taskId));
      },
      error: () => this.toast.error('Impossible de charger la to-do list.'),
    });
  }

  /** Oublie les éléments déjà chargés (les cartes repartent des compteurs du backend). */
  clearCache(): void {
    this.items.set([]);
    this.loadedTaskIds.set(new Set());
  }

  addItem(taskId: string, label: string): void {
    const trimmed = label.trim();
    if (!trimmed) {
      return;
    }
    this.http.post<ChecklistItem>(`${this.apiUrl}/tasks/${taskId}/checklist-items`, { label: trimmed }).subscribe({
      next: (item) => this.items.update((all) => [...all, item]),
      error: () => this.toast.error("Impossible d'ajouter cet élément."),
    });
  }

  toggleItem(itemId: string): void {
    const item = this.items().find((i) => i.id === itemId);
    if (!item) {
      return;
    }
    this.replace({ ...item, completed: !item.completed });
    this.http.patch<ChecklistItem>(`${this.apiUrl}/checklist-items/${itemId}`, { completed: !item.completed }).subscribe({
      next: (updated) => this.replace(updated),
      error: () => {
        this.replace(item);
        this.toast.error('Impossible de modifier cet élément.');
      },
    });
  }

  deleteItem(itemId: string): void {
    this.http.delete<void>(`${this.apiUrl}/checklist-items/${itemId}`).subscribe({
      next: () => this.items.update((all) => all.filter((i) => i.id !== itemId)),
      error: () => this.toast.error('Impossible de supprimer cet élément.'),
    });
  }

  private replace(item: ChecklistItem): void {
    this.items.update((all) => all.map((i) => (i.id === item.id ? item : i)));
  }
}
