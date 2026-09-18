import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import {
  LucideArrowRight,
  LucideCheckSquare,
  LucideClock,
  LucideTrendingUp,
  LucideUsers,
  LucideZap,
} from '@lucide/angular';
import { AuthService, CurrentTeamService, DashboardService } from '../../core/services';
import type { DashboardStats, Task } from '../../core/models';
import { Avatar } from '../../shared/components/avatar/avatar';
import { PriorityBadge } from '../../shared/components/priority-badge/priority-badge';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    Avatar,
    PriorityBadge,
    LucideCheckSquare,
    LucideTrendingUp,
    LucideZap,
    LucideClock,
    LucideUsers,
    LucideArrowRight,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private readonly authService = inject(AuthService);
  private readonly currentTeamService = inject(CurrentTeamService);
  private readonly dashboardService = inject(DashboardService);

  protected readonly currentUser = this.authService.currentUser;
  protected readonly team = this.currentTeamService.currentTeam;
  protected readonly teamsLoading = this.currentTeamService.loading;
  protected readonly teamsError = this.currentTeamService.error;

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly stats = signal<DashboardStats | null>(null);

  protected readonly today = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  constructor() {
    this.currentTeamService.ensureLoaded().subscribe();

    effect(() => {
      const team = this.team();
      if (team) {
        untracked(() => this.loadStats(team.id));
      } else if (!this.teamsLoading()) {
        untracked(() => {
          this.stats.set(null);
          this.loading.set(false);
        });
      }
    });
  }

  private loadStats(teamId: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.dashboardService
      .getForTeam(teamId)
      .pipe(
        catchError(() => {
          this.error.set('Impossible de charger le tableau de bord pour le moment.');
          return of(null);
        }),
      )
      .subscribe((stats) => {
        this.stats.set(stats);
        this.loading.set(false);
      });
  }

  protected firstName(name: string | undefined | null): string {
    return name?.split(' ')[0] ?? '';
  }

  protected assigneeFullNames(task: Task): string {
    return task.assignees.map((a) => a.name).join(', ');
  }

  protected assigneeSummary(task: Task): string {
    if (task.assignees.length === 0) {
      return 'Non assigné';
    }
    const names = task.assignees.map((a) => this.firstName(a.name));
    if (names.length <= 2) {
      return names.join(', ');
    }
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }
}
