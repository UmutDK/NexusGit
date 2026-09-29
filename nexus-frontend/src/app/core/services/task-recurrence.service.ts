import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ToastService } from './toast.service';
import type { RecurrenceUnit, TaskRecurrence } from '../models';

/**
 * Règles de répétition ("tous les N jours/semaines/mois"), adossées au backend.
 * Les rappels d'occurrence (notification recurrence_due) sont envoyés par le job
 * quotidien du backend (cron_daily.py).
 */
@Injectable({ providedIn: 'root' })
export class TaskRecurrenceService {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly apiUrl = environment.apiUrl;

  readonly rules = signal<TaskRecurrence[]>([]);

  constructor() {
    try {
      localStorage.removeItem('nexus_task_recurrences_mock_v1');
    } catch {
      // Stockage indisponible : rien à nettoyer.
    }
  }

  ruleForTask(taskId: string): TaskRecurrence | null {
    return this.rules().find((r) => r.taskId === taskId) ?? null;
  }

  load(taskId: string): void {
    this.http.get<TaskRecurrence | null>(`${this.apiUrl}/tasks/${taskId}/recurrence`).subscribe({
      next: (rule) => this.store(taskId, rule),
      error: () => this.toast.error('Impossible de charger la répétition.'),
    });
  }

  setRule(taskId: string, interval: number, unit: RecurrenceUnit): void {
    const safeInterval = Math.min(365, Math.max(1, Math.round(interval)));
    this.http
      .put<TaskRecurrence>(`${this.apiUrl}/tasks/${taskId}/recurrence`, { interval: safeInterval, unit })
      .subscribe({
        next: (rule) => this.store(taskId, rule),
        error: () => this.toast.error("Impossible d'enregistrer la répétition."),
      });
  }

  clearRule(taskId: string): void {
    this.http.delete<void>(`${this.apiUrl}/tasks/${taskId}/recurrence`).subscribe({
      next: () => this.store(taskId, null),
      error: () => this.toast.error('Impossible de supprimer la répétition.'),
    });
  }

  private store(taskId: string, rule: TaskRecurrence | null): void {
    this.rules.update((all) => [...all.filter((r) => r.taskId !== taskId), ...(rule ? [rule] : [])]);
  }
}
