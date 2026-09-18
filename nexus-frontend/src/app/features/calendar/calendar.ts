import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import { BoardService, CurrentTeamService, LabelService, StatusService, TaskService, TeamService } from '../../core/services';
import type { Board, Label, Status, Task, TaskPriority, TeamMember } from '../../core/models';
import { TaskDetailModal } from '../boards/components/task-detail-modal/task-detail-modal';
import { Avatar } from '../../shared/components/avatar/avatar';
import { FieldValueDirective } from '../../shared/directives/field-value.directive';
import { TASK_PRIORITIES } from '../../shared/constants/task-priority';

interface CalendarDay {
  date: Date;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  tasks: Task[];
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

@Component({
  selector: 'app-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TaskDetailModal, Avatar, FieldValueDirective, LucideChevronLeft, LucideChevronRight],
  templateUrl: './calendar.html',
  styleUrl: './calendar.css',
})
export class CalendarPage {
  private readonly currentTeamService = inject(CurrentTeamService);
  private readonly teamService = inject(TeamService);
  private readonly boardService = inject(BoardService);
  private readonly taskService = inject(TaskService);
  private readonly statusService = inject(StatusService);
  private readonly labelService = inject(LabelService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly team = this.currentTeamService.currentTeam;
  protected readonly teamsLoading = this.currentTeamService.loading;

  protected readonly members = signal<TeamMember[]>([]);
  protected readonly labels = signal<Label[]>([]);
  protected readonly tasks = signal<Task[]>([]);
  private readonly statusesByBoard = signal<Map<string, Status[]>>(new Map());

  protected readonly filterAssigneeId = signal('');
  protected readonly filterLabelId = signal('');
  protected readonly filterPriority = signal<TaskPriority | ''>('');
  protected readonly hasActiveFilters = computed(
    () => this.filterAssigneeId() !== '' || this.filterLabelId() !== '' || this.filterPriority() !== '',
  );
  protected readonly priorities = TASK_PRIORITIES;

  protected readonly selectedTask = signal<Task | null>(null);

  private readonly today = new Date();
  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly viewYear = signal(this.today.getFullYear());
  protected readonly viewMonth = signal(this.today.getMonth());

  protected readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(
      new Date(this.viewYear(), this.viewMonth(), 1),
    ),
  );

  private readonly filteredTasks = computed(() => {
    const assigneeId = this.filterAssigneeId();
    const labelId = this.filterLabelId();
    const priority = this.filterPriority();
    return this.tasks().filter(
      (task) =>
        !!task.dueDate &&
        (!assigneeId || task.assignees.some((a) => a.id === assigneeId)) &&
        (!labelId || task.labels.some((l) => l.id === labelId)) &&
        (!priority || task.priority === priority),
    );
  });

  protected readonly weeks = computed<CalendarDay[][]>(() => {
    const byDate = new Map<string, Task[]>();
    for (const task of this.filteredTasks()) {
      const iso = task.dueDate!.slice(0, 10);
      const list = byDate.get(iso);
      if (list) {
        list.push(task);
      } else {
        byDate.set(iso, [task]);
      }
    }

    const year = this.viewYear();
    const month = this.viewMonth();
    const todayIso = this.toIso(this.today);
    const firstOfMonth = new Date(year, month, 1);
    const dow = firstOfMonth.getDay();
    const offset = dow === 0 ? 6 : dow - 1;
    const cursor = new Date(firstOfMonth);
    cursor.setDate(cursor.getDate() - offset);

    const result: CalendarDay[][] = [];
    for (let w = 0; w < 6; w++) {
      const week: CalendarDay[] = [];
      for (let d = 0; d < 7; d++) {
        const iso = this.toIso(cursor);
        week.push({
          date: new Date(cursor),
          iso,
          inMonth: cursor.getMonth() === month,
          isToday: iso === todayIso,
          tasks: byDate.get(iso) ?? [],
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      result.push(week);
      if (cursor.getMonth() !== month && w >= 4) {
        break;
      }
    }
    return result;
  });

  constructor() {
    this.currentTeamService.ensureLoaded().subscribe();

    effect(() => {
      const team = this.team();
      if (team) {
        untracked(() => this.loadTeamData(team.id));
      } else if (!this.teamsLoading()) {
        untracked(() => {
          this.members.set([]);
          this.labels.set([]);
          this.tasks.set([]);
          this.loading.set(false);
        });
      }
    });
  }

  private loadTeamData(teamId: string): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      boards: this.boardService.listForTeam(teamId),
      members: this.teamService.listMembers(teamId),
      labels: this.labelService.listForTeam(teamId),
    })
      .pipe(
        catchError(() => {
          this.error.set('Impossible de charger le calendrier pour le moment.');
          return of(null);
        }),
      )
      .subscribe((result) => {
        if (!result) {
          this.loading.set(false);
          return;
        }
        this.members.set(result.members);
        this.labels.set(result.labels);
        this.loadTasks(result.boards);
      });
  }

  private loadTasks(boards: Board[]): void {
    if (boards.length === 0) {
      this.tasks.set([]);
      this.statusesByBoard.set(new Map());
      this.loading.set(false);
      return;
    }

    forkJoin(
      boards.map((board) =>
        forkJoin({
          board: of(board),
          tasks: this.taskService.listForBoard(board.id),
          statuses: this.statusService.listForBoard(board.id),
        }),
      ),
    )
      .pipe(
        catchError(() => {
          this.error.set('Impossible de charger les tâches pour le moment.');
          return of(null);
        }),
      )
      .subscribe((perBoard) => {
        if (perBoard) {
          this.tasks.set(perBoard.flatMap((b) => b.tasks));
          this.statusesByBoard.set(new Map(perBoard.map((b) => [b.board.id, b.statuses])));
        }
        this.loading.set(false);
      });
  }

  protected prevMonth(): void {
    const month = this.viewMonth();
    if (month === 0) {
      this.viewMonth.set(11);
      this.viewYear.update((y) => y - 1);
    } else {
      this.viewMonth.set(month - 1);
    }
  }

  protected nextMonth(): void {
    const month = this.viewMonth();
    if (month === 11) {
      this.viewMonth.set(0);
      this.viewYear.update((y) => y + 1);
    } else {
      this.viewMonth.set(month + 1);
    }
  }

  protected goToToday(): void {
    this.viewYear.set(this.today.getFullYear());
    this.viewMonth.set(this.today.getMonth());
  }

  protected onFilterPriorityChange(value: string): void {
    this.filterPriority.set(value as TaskPriority | '');
  }

  protected clearFilters(): void {
    this.filterAssigneeId.set('');
    this.filterLabelId.set('');
    this.filterPriority.set('');
  }

  protected openTask(task: Task): void {
    this.selectedTask.set(task);
  }

  protected statusesForSelectedTask(): Status[] {
    const task = this.selectedTask();
    return task ? (this.statusesByBoard().get(task.boardId) ?? []) : [];
  }

  protected handleTaskUpdated(updated: Task): void {
    this.tasks.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
    this.selectedTask.set(updated);
  }

  protected handleTaskDeleted(taskId: string): void {
    this.tasks.update((list) => list.filter((t) => t.id !== taskId));
    this.selectedTask.set(null);
  }

  protected handleLabelCreated(label: Label): void {
    this.labels.update((list) => [...list, label]);
  }

  private toIso(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
