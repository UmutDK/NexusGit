import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import type { Task, TeamMember, TimeEntry } from '../models';

const STORAGE_KEY = 'nexus_time_entries_mock_v1';
const SEEDED_TEAMS_KEY = 'nexus_time_entries_seeded_teams_v1';

/**
 * Stands in for the backend time-tracking API, which doesn't exist yet.
 * Entries live in localStorage (shared instantly across tabs of this same
 * browser profile via the native `storage` event) so start/stop, elapsed
 * time and the recap table all work end-to-end without a server.
 *
 * To demo the "someone else is working on this" presence indicator without
 * a second real account, registerContext() seeds a bit of believable
 * activity from real teammates/tasks the first time a team is opened.
 * Swapping this service for real HTTP calls to a polled endpoint
 * (GET /tasks/active-timers, POST /tasks/{id}/timer/start|stop) is the
 * intended migration path once that API exists.
 */
@Injectable({ providedIn: 'root' })
export class TimeTrackingService {
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly entries = signal<TimeEntry[]>(this.load());

  readonly activeEntries = computed(() => this.entries().filter((e) => e.endedAt === null));

  readonly myActiveEntry = computed(() => {
    const userId = this.authService.currentUser()?.id;
    return this.activeEntries().find((e) => e.userId === userId) ?? null;
  });

  constructor() {
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        this.entries.set(this.parse(event.newValue));
      }
    });
  }

  activeEntryForTask(taskId: string): TimeEntry | null {
    return this.activeEntries().find((e) => e.taskId === taskId) ?? null;
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

  start(task: Task, teamId: string): void {
    const user = this.authService.currentUser();
    if (!user) {
      return;
    }

    const previous = this.entries().find((e) => e.userId === user.id && e.endedAt === null);
    const now = new Date().toISOString();

    let list = this.entries();
    if (previous) {
      list = list.map((e) =>
        e.id === previous.id
          ? { ...e, endedAt: now, durationSeconds: this.secondsBetween(e.startedAt, now) }
          : e,
      );
    }

    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      taskId: task.id,
      taskTitle: task.title,
      teamId,
      userId: user.id,
      userName: user.name,
      startedAt: now,
      endedAt: null,
      durationSeconds: null,
    };
    this.persist([...list, entry]);

    if (previous && previous.taskId !== task.id) {
      this.toast.info(`Chrono arrêté sur "${previous.taskTitle}" et démarré sur "${task.title}".`);
    }
  }

  /**
   * Logs a session after the fact (date + start/end time) for when someone
   * forgot to press "Démarrer" — inserted already completed, so it never
   * touches the "one active timer" rule that start()/stop() enforce.
   */
  addManualEntry(task: Task, teamId: string, startedAtIso: string, endedAtIso: string): void {
    const user = this.authService.currentUser();
    if (!user) {
      return;
    }
    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      taskId: task.id,
      taskTitle: task.title,
      teamId,
      userId: user.id,
      userName: user.name,
      startedAt: startedAtIso,
      endedAt: endedAtIso,
      durationSeconds: this.secondsBetween(startedAtIso, endedAtIso),
    };
    this.persist([...this.entries(), entry]);
  }

  stop(taskId: string): void {
    const user = this.authService.currentUser();
    if (!user) {
      return;
    }
    const now = new Date().toISOString();
    const list = this.entries().map((e) =>
      e.userId === user.id && e.taskId === taskId && e.endedAt === null
        ? { ...e, endedAt: now, durationSeconds: this.secondsBetween(e.startedAt, now) }
        : e,
    );
    this.persist(list);
  }

  /**
   * Seeds a bit of realistic-looking history (and one live "someone else is
   * working on X" entry) the first time a team's board is opened, using its
   * real members and tasks, purely so the presence badge and recap table
   * have something to show before the real multi-user backend exists.
   */
  registerContext(teamId: string, members: TeamMember[], tasks: Task[]): void {
    const seeded = this.loadSeededTeams();
    if (seeded.has(teamId) || tasks.length === 0) {
      return;
    }

    const currentUserId = this.authService.currentUser()?.id;
    const colleagues = members.map((m) => m.user).filter((u) => u.id !== currentUserId);
    if (colleagues.length === 0) {
      return;
    }

    const seededEntries: TimeEntry[] = [];
    const now = Date.now();

    for (let i = 0; i < Math.min(6, tasks.length * colleagues.length); i++) {
      const user = colleagues[i % colleagues.length];
      const task = tasks[i % tasks.length];
      const daysAgo = 1 + (i % 4);
      const startedAt = new Date(now - daysAgo * 86_400_000 - i * 900_000);
      const durationSeconds = 600 + Math.floor(Math.random() * 6600);
      const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
      seededEntries.push({
        id: crypto.randomUUID(),
        taskId: task.id,
        taskTitle: task.title,
        teamId,
        userId: user.id,
        userName: user.name,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSeconds,
      });
    }

    const liveUser = colleagues[0];
    const liveTask = tasks[0];
    const liveStartedAt = new Date(now - (5 + Math.floor(Math.random() * 40)) * 60_000);
    seededEntries.push({
      id: crypto.randomUUID(),
      taskId: liveTask.id,
      taskTitle: liveTask.title,
      teamId,
      userId: liveUser.id,
      userName: liveUser.name,
      startedAt: liveStartedAt.toISOString(),
      endedAt: null,
      durationSeconds: null,
    });

    this.persist([...this.entries(), ...seededEntries]);
    seeded.add(teamId);
    localStorage.setItem(SEEDED_TEAMS_KEY, JSON.stringify([...seeded]));
  }

  private secondsBetween(startIso: string, endIso: string): number {
    return Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
  }

  private persist(list: TimeEntry[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    this.entries.set(list);
  }

  private load(): TimeEntry[] {
    return this.parse(localStorage.getItem(STORAGE_KEY));
  }

  private parse(raw: string | null): TimeEntry[] {
    if (!raw) {
      return [];
    }
    try {
      return JSON.parse(raw) as TimeEntry[];
    } catch {
      return [];
    }
  }

  private loadSeededTeams(): Set<string> {
    try {
      const raw = localStorage.getItem(SEEDED_TEAMS_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  }
}
