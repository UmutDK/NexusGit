import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap } from 'rxjs';
import { TeamService } from './team.service';
import type { Team } from '../models';

const STORAGE_KEY = 'nexus_current_team_id';

/**
 * Centralizes which team is "active" across the app (dashboard, board, teams pages),
 * since a user can belong to several teams. Selection persists across reloads.
 */
@Injectable({ providedIn: 'root' })
export class CurrentTeamService {
  private readonly teamService = inject(TeamService);

  readonly teams = signal<Team[]>([]);
  readonly currentTeamId = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly currentTeam = computed(() => this.teams().find((t) => t.id === this.currentTeamId()) ?? null);

  private loaded = false;

  ensureLoaded(): Observable<Team[]> {
    if (this.loaded) {
      return of(this.teams());
    }
    this.loading.set(true);
    this.error.set(null);
    return this.teamService.list().pipe(
      tap((teams) => {
        this.teams.set(teams);
        this.pickInitialTeam(teams);
        this.loaded = true;
        this.loading.set(false);
      }),
      catchError(() => {
        this.error.set('Impossible de charger vos équipes.');
        this.loading.set(false);
        return of([]);
      }),
    );
  }

  private pickInitialTeam(teams: Team[]): void {
    const stored = localStorage.getItem(STORAGE_KEY);
    const match = stored && teams.some((t) => t.id === stored) ? stored : (teams[0]?.id ?? null);
    this.currentTeamId.set(match);
  }

  selectTeam(teamId: string): void {
    this.currentTeamId.set(teamId);
    localStorage.setItem(STORAGE_KEY, teamId);
  }

  addTeam(team: Team): void {
    this.teams.update((list) => [...list, team]);
    this.selectTeam(team.id);
  }

  updateTeam(team: Team): void {
    this.teams.update((list) => list.map((t) => (t.id === team.id ? team : t)));
  }

  removeTeam(teamId: string): void {
    this.teams.update((list) => list.filter((t) => t.id !== teamId));
    if (this.currentTeamId() === teamId) {
      const next = this.teams()[0]?.id ?? null;
      this.currentTeamId.set(next);
      if (next) {
        localStorage.setItem(STORAGE_KEY, next);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }

  reset(): void {
    this.teams.set([]);
    this.currentTeamId.set(null);
    this.loading.set(true);
    this.error.set(null);
    this.loaded = false;
    localStorage.removeItem(STORAGE_KEY);
  }
}
