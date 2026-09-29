import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { CurrentTeamService } from './current-team.service';
import { ToastService } from './toast.service';
import type { Task, TimeEntry } from '../models';

/** Fréquence de rafraîchissement, pour voir les chronos lancés ou arrêtés par les collègues. */
const POLL_INTERVAL_MS = 10_000;

/** Clés de l'ancien mock localStorage, supprimées pour ne plus afficher de fausses sessions. */
const LEGACY_STORAGE_KEYS = ['nexus_time_entries_mock_v1', 'nexus_time_entries_seeded_teams_v1'];

/**
 * Suivi du temps de l'équipe courante, adossé au backend (un seul chrono actif
 * par utilisateur, géré côté serveur). Les sessions de l'équipe sont rechargées
 * à chaque changement d'équipe puis toutes les POLL_INTERVAL_MS tant que l'onglet
 * est visible, pour que la présence "X en cours" reflète les autres utilisateurs.
 */
@Injectable({ providedIn: 'root' })
export class TimeTrackingService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly currentTeamService = inject(CurrentTeamService);
  private readonly toast = inject(ToastService);
  private readonly apiUrl = environment.apiUrl;

  private loadedTeamId: string | null = null;

  readonly entries = signal<TimeEntry[]>([]);

  readonly activeEntries = computed(() => this.entries().filter((e) => e.endedAt === null));

  readonly myActiveEntry = computed(() => {
    const userId = this.authService.currentUser()?.id;
    return this.activeEntries().find((e) => e.userId === userId) ?? null;
  });

  constructor() {
    for (const key of LEGACY_STORAGE_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Stockage indisponible : rien à nettoyer.
      }
    }

    effect(() => {
      const teamId = this.authService.currentUser() ? this.currentTeamService.currentTeamId() : null;
      untracked(() => this.switchTeam(teamId));
    });

    setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.refresh();
      }
    }, POLL_INTERVAL_MS);
  }

  /** Mon chrono en cours sur cette tâche. */
  myActiveEntryForTask(taskId: string): TimeEntry | null {
    const userId = this.authService.currentUser()?.id;
    return this.activeEntries().find((e) => e.taskId === taskId && e.userId === userId) ?? null;
  }

  /** Le chrono d'un collègue en cours sur cette tâche. */
  otherActiveEntryForTask(taskId: string): TimeEntry | null {
    const userId = this.authService.currentUser()?.id;
    return this.activeEntries().find((e) => e.taskId === taskId && e.userId !== userId) ?? null;
  }

  entriesForTask(taskId: string): TimeEntry[] {
    return this.entries()
      .filter((e) => e.taskId === taskId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  entriesForTeam(teamId: string): TimeEntry[] {
    return this.entries()
      .filter((e) => e.teamId === teamId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /** Recharge les sessions de l'équipe courante depuis le backend. */
  refresh(): void {
    const teamId = this.loadedTeamId;
    if (!teamId) {
      return;
    }
    this.http.get<TimeEntry[]>(`${this.apiUrl}/teams/${teamId}/time-entries`).subscribe({
      next: (list) => {
        if (this.loadedTeamId === teamId) {
          this.entries.set(list);
        }
      },
      error: () => {
        // Rafraîchissement silencieux : le prochain passage réessaiera.
      },
    });
  }

  start(task: Task): void {
    const previous = this.myActiveEntry();
    this.http.post<TimeEntry>(`${this.apiUrl}/tasks/${task.id}/timer/start`, {}).subscribe({
      next: (entry) => {
        // Le backend a arrêté l'éventuel chrono précédent : on le reflète tout de suite, puis on relit.
        this.entries.update((list) => [
          entry,
          ...list
            .filter((e) => e.id !== entry.id)
            .map((e) =>
              e.id === previous?.id && previous.id !== entry.id
                ? { ...e, endedAt: entry.startedAt, durationSeconds: this.secondsBetween(e.startedAt, entry.startedAt) }
                : e,
            ),
        ]);
        this.refresh();
        if (previous && previous.taskId !== task.id) {
          this.toast.info(`Chrono arrêté sur "${previous.taskTitle}" et démarré sur "${task.title}".`);
        }
      },
      error: () => this.toast.error('Impossible de démarrer le chrono.'),
    });
  }

  stop(taskId: string): void {
    this.http.post<TimeEntry>(`${this.apiUrl}/tasks/${taskId}/timer/stop`, {}).subscribe({
      next: (entry) => this.upsert(entry),
      error: () => {
        this.toast.error("Impossible d'arrêter le chrono.");
        this.refresh();
      },
    });
  }

  /**
   * Enregistre une session passée (oubli d'appuyer sur "Démarrer") ; elle est
   * créée déjà terminée et ne touche pas au chrono actif.
   */
  addManualEntry(taskId: string, startedAtIso: string, endedAtIso: string): Observable<TimeEntry> {
    return this.http
      .post<TimeEntry>(`${this.apiUrl}/tasks/${taskId}/time-entries`, { startedAt: startedAtIso, endedAt: endedAtIso })
      .pipe(tap((entry) => this.upsert(entry)));
  }

  private switchTeam(teamId: string | null): void {
    if (teamId === this.loadedTeamId) {
      return;
    }
    this.loadedTeamId = teamId;
    this.entries.set([]);
    this.refresh();
  }

  private upsert(entry: TimeEntry): void {
    this.entries.update((list) =>
      list.some((e) => e.id === entry.id) ? list.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...list],
    );
  }

  private secondsBetween(startIso: string, endIso: string): number {
    return Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
  }
}
