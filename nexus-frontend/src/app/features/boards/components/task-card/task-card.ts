import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LucideCalendar, LucideCirclePause, LucideCirclePlay } from '@lucide/angular';
import type { Task } from '../../../../core/models';
import {
  AuthService,
  ChecklistService,
  CurrentTeamService,
  TickerService,
  TimeTrackingService,
} from '../../../../core/services';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { PriorityBadge } from '../../../../shared/components/priority-badge/priority-badge';
import { LabelPill } from '../../../../shared/components/label-pill/label-pill';
import { formatClock } from '../../../../shared/utils/duration.util';

const MAX_VISIBLE_ASSIGNEES = 3;

@Component({
  selector: 'app-task-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, PriorityBadge, LabelPill, LucideCalendar, LucideCirclePlay, LucideCirclePause],
  templateUrl: './task-card.html',
  styleUrl: './task-card.css',
})
export class TaskCard {
  private readonly timeTracking = inject(TimeTrackingService);
  private readonly authService = inject(AuthService);
  private readonly currentTeamService = inject(CurrentTeamService);
  private readonly ticker = inject(TickerService);
  private readonly checklist = inject(ChecklistService);

  readonly task = input.required<Task>();

  protected readonly maxVisibleAssignees = MAX_VISIBLE_ASSIGNEES;

  protected readonly checklistProgress = computed(() => this.checklist.progressForTask(this.task().id));

  protected readonly myActiveEntry = computed(() => {
    const entry = this.timeTracking.activeEntryForTask(this.task().id);
    return entry && entry.userId === this.authService.currentUser()?.id ? entry : null;
  });

  protected readonly otherActiveEntry = computed(() => {
    const entry = this.timeTracking.activeEntryForTask(this.task().id);
    return entry && entry.userId !== this.authService.currentUser()?.id ? entry : null;
  });

  protected readonly elapsedLabel = computed(() => {
    const entry = this.myActiveEntry();
    if (!entry) {
      return '';
    }
    const elapsedSeconds = (this.ticker.now() - new Date(entry.startedAt).getTime()) / 1000;
    return formatClock(elapsedSeconds);
  });

  protected toggleTimer(event: Event): void {
    event.stopPropagation();
    if (this.myActiveEntry()) {
      this.timeTracking.stop(this.task().id);
      return;
    }
    const teamId = this.currentTeamService.currentTeamId();
    if (teamId) {
      this.timeTracking.start(this.task(), teamId);
    }
  }

  protected stopEventPropagation(event: Event): void {
    event.stopPropagation();
  }

  protected assigneeNames(): string {
    return this.task()
      .assignees.map((a) => a.name)
      .join(', ');
  }

  protected formatDueDate(dueDate: string | null): string {
    if (!dueDate) {
      return '';
    }
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(
      new Date(dueDate),
    );
  }
}
