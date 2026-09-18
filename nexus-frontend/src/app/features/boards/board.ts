import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { catchError, forkJoin, of } from 'rxjs';
import { LucideBell, LucidePencil, LucidePlus, LucideRotateCcw, LucideSearch, LucideTrash2 } from '@lucide/angular';
import {
  BoardService,
  CurrentTeamService,
  DialogService,
  LabelService,
  StatusService,
  TaskService,
  TeamService,
  TimeTrackingService,
  ToastService,
} from '../../core/services';
import type { Board, CreateTaskRequest, Label, Status, Task, TaskPriority, TeamMember } from '../../core/models';
import { TaskModal } from './components/task-modal/task-modal';
import { TaskDetailModal } from './components/task-detail-modal/task-detail-modal';
import { StatusColumn } from './components/status-column/status-column';
import { NameColorForm, type NameColorFormValue } from '../../shared/components/name-color-form/name-color-form';
import { FieldValueDirective } from '../../shared/directives/field-value.directive';
import { TASK_PRIORITIES } from '../../shared/constants/task-priority';

const NEW_BOARD_OPTION = '__new__';

@Component({
  selector: 'app-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DragDropModule,
    TaskModal,
    TaskDetailModal,
    StatusColumn,
    NameColorForm,
    FieldValueDirective,
    LucideBell,
    LucidePlus,
    LucidePencil,
    LucideTrash2,
    LucideSearch,
    LucideRotateCcw,
  ],
  templateUrl: './board.html',
  styleUrl: './board.css',
})
export class BoardPage {
  private readonly currentTeamService = inject(CurrentTeamService);
  private readonly teamService = inject(TeamService);
  private readonly boardService = inject(BoardService);
  private readonly statusService = inject(StatusService);
  private readonly taskService = inject(TaskService);
  private readonly labelService = inject(LabelService);
  private readonly timeTracking = inject(TimeTrackingService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);

  protected readonly loading = signal(true);
  protected readonly loadingBoard = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly team = this.currentTeamService.currentTeam;
  protected readonly boards = signal<Board[]>([]);
  protected readonly board = signal<Board | null>(null);
  protected readonly statuses = signal<Status[]>([]);
  protected readonly tasks = signal<Task[]>([]);
  protected readonly members = signal<TeamMember[]>([]);
  protected readonly labels = signal<Label[]>([]);

  protected readonly searchQuery = signal('');
  protected readonly filterAssigneeId = signal('');
  protected readonly filterLabelId = signal('');
  protected readonly filterPriority = signal<TaskPriority | ''>('');
  protected readonly hasActiveFilters = computed(
    () =>
      this.searchQuery().trim() !== '' ||
      this.filterAssigneeId() !== '' ||
      this.filterLabelId() !== '' ||
      this.filterPriority() !== '',
  );
  protected readonly priorities = TASK_PRIORITIES;

  protected readonly showCreateModal = signal(false);
  protected readonly modalStatusId = signal('');
  protected readonly selectedTask = signal<Task | null>(null);

  protected readonly isCoordinator = computed(() => this.team()?.myRole === 'coordinator');
  protected readonly showAddStatus = signal(false);

  protected readonly newBoardOption = NEW_BOARD_OPTION;
  protected readonly showNewBoardForm = signal(false);
  protected readonly renamingBoard = signal(false);

  protected readonly dueSoonCount = computed(() => {
    const team = this.team();
    if (!team) {
      return 0;
    }
    const now = new Date();
    const horizon = new Date(now.getTime() + team.dueSoonDays * 86_400_000);
    return this.tasks().filter((task) => {
      if (task.completedAt || !task.dueDate) {
        return false;
      }
      const due = new Date(task.dueDate);
      return due >= now && due <= horizon;
    }).length;
  });

  protected readonly dueSoonLabel = computed(() => {
    const days = this.team()?.dueSoonDays ?? 7;
    return days >= 6 ? 'cette semaine' : `dans les ${days} prochains jours`;
  });

  constructor() {
    this.currentTeamService.ensureLoaded().subscribe();

    effect(() => {
      const team = this.team();
      if (team) {
        untracked(() => this.loadTeamData(team.id));
      } else if (!this.currentTeamService.loading()) {
        untracked(() => {
          this.boards.set([]);
          this.board.set(null);
          this.statuses.set([]);
          this.tasks.set([]);
          this.members.set([]);
          this.labels.set([]);
          this.loading.set(false);
        });
      }
    });
  }

  private loadTeamData(teamId: string): void {
    this.loading.set(true);
    forkJoin({
      boards: this.boardService.listForTeam(teamId),
      members: this.teamService.listMembers(teamId),
      labels: this.labelService.listForTeam(teamId),
    })
      .pipe(
        catchError(() => {
          this.error.set('Impossible de charger le tableau des tâches pour le moment.');
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
        this.boards.set(result.boards);
        const firstBoard = result.boards[0] ?? null;
        if (!firstBoard) {
          this.board.set(null);
          this.statuses.set([]);
          this.tasks.set([]);
          this.loading.set(false);
          return;
        }
        this.loadBoard(firstBoard, () => this.loading.set(false));
      });
  }

  private loadBoard(board: Board, onDone?: () => void): void {
    this.board.set(board);
    this.loadingBoard.set(true);
    forkJoin({
      statuses: this.statusService.listForBoard(board.id),
      tasks: this.taskService.listForBoard(board.id),
    })
      .pipe(
        catchError(() => {
          this.error.set('Impossible de charger le tableau des tâches pour le moment.');
          return of(null);
        }),
      )
      .subscribe((result) => {
        if (result) {
          this.statuses.set([...result.statuses].sort((a, b) => a.position - b.position));
          this.tasks.set(result.tasks);
          const teamId = this.team()?.id;
          if (teamId) {
            this.timeTracking.registerContext(teamId, this.members(), result.tasks);
          }
        }
        this.loadingBoard.set(false);
        onDone?.();
      });
  }

  protected onBoardSelectChange(value: string): void {
    if (value === NEW_BOARD_OPTION) {
      this.showNewBoardForm.set(true);
      return;
    }
    const board = this.boards().find((b) => b.id === value);
    if (board) {
      this.loadBoard(board);
    }
  }

  protected cancelNewBoard(): void {
    this.showNewBoardForm.set(false);
  }

  protected createBoard(value: NameColorFormValue): void {
    const team = this.team();
    const name = value.name;
    if (!team) {
      return;
    }
    this.boardService.create(team.id, { name }).subscribe({
      next: (board) => {
        this.boards.update((list) => [...list, board]);
        this.showNewBoardForm.set(false);
        this.loadBoard(board);
        this.toast.success(`Tableau "${board.name}" créé.`);
      },
      error: () => this.toast.error('Impossible de créer ce tableau.'),
    });
  }

  protected startRenameBoard(): void {
    if (!this.board()) {
      return;
    }
    this.renamingBoard.set(true);
  }

  protected cancelRenameBoard(): void {
    this.renamingBoard.set(false);
  }

  protected saveRenameBoard(value: NameColorFormValue): void {
    const board = this.board();
    const name = value.name;
    if (!board) {
      return;
    }
    this.boardService.update(board.id, { name }).subscribe({
      next: (updated) => {
        this.board.set(updated);
        this.boards.update((list) => list.map((b) => (b.id === updated.id ? updated : b)));
        this.renamingBoard.set(false);
        this.toast.success('Tableau renommé.');
      },
      error: () => this.toast.error('Impossible de renommer ce tableau.'),
    });
  }

  protected async deleteBoard(): Promise<void> {
    const board = this.board();
    if (!board) {
      return;
    }
    const message =
      this.tasks().length > 0
        ? `Le tableau "${board.name}" contient des tâches qui seront supprimées avec lui. Continuer ?`
        : `Supprimer le tableau "${board.name}" ?`;
    const confirmed = await this.dialog.confirm(message, { danger: true });
    if (!confirmed) {
      return;
    }
    this.boardService.delete(board.id).subscribe({
      next: () => {
        const remaining = this.boards().filter((b) => b.id !== board.id);
        this.boards.set(remaining);
        if (remaining.length > 0) {
          this.loadBoard(remaining[0]);
        } else {
          this.board.set(null);
          this.statuses.set([]);
          this.tasks.set([]);
        }
        this.toast.success(`Tableau "${board.name}" supprimé.`);
      },
      error: () => this.toast.error('Impossible de supprimer ce tableau.'),
    });
  }

  /**
   * Filters + groups once per tasks/filter change instead of re-filtering the
   * full task list on every template evaluation of tasksForStatus().
   */
  protected readonly tasksByStatus = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const assigneeId = this.filterAssigneeId();
    const labelId = this.filterLabelId();
    const priority = this.filterPriority();

    const filtered = this.tasks().filter(
      (task) =>
        (!query ||
          task.title.toLowerCase().includes(query) ||
          (task.description ?? '').toLowerCase().includes(query)) &&
        (!assigneeId || task.assignees.some((a) => a.id === assigneeId)) &&
        (!labelId || task.labels.some((l) => l.id === labelId)) &&
        (!priority || task.priority === priority),
    );

    const map = new Map<string, Task[]>();
    for (const task of filtered) {
      const list = map.get(task.statusId);
      if (list) {
        list.push(task);
      } else {
        map.set(task.statusId, [task]);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  });

  protected tasksForStatus(statusId: string): Task[] {
    return this.tasksByStatus().get(statusId) ?? [];
  }

  protected onFilterPriorityChange(value: string): void {
    this.filterPriority.set(value as TaskPriority | '');
  }

  protected clearFilters(): void {
    this.searchQuery.set('');
    this.filterAssigneeId.set('');
    this.filterLabelId.set('');
    this.filterPriority.set('');
  }

  protected hasAnyVisibleTasks(): boolean {
    return this.tasksByStatus().size > 0;
  }

  protected onDrop(event: CdkDragDrop<Task[]>, targetStatusId: string): void {
    const task = event.item.data as Task;
    if (!task) {
      return;
    }

    const destination = this.tasksForStatus(targetStatusId).filter((t) => t.id !== task.id);
    const before = destination[event.currentIndex - 1];
    const after = destination[event.currentIndex];

    let position: number;
    if (before && after) {
      position = (before.position + after.position) / 2;
    } else if (before) {
      position = before.position + 1;
    } else if (after) {
      position = after.position - 1;
    } else {
      position = 1;
    }

    this.tasks.update((list) =>
      list.map((t) => (t.id === task.id ? { ...t, statusId: targetStatusId, position } : t)),
    );

    this.taskService.move(task.id, targetStatusId, position).subscribe({
      error: () => this.toast.error('Impossible de déplacer la tâche.'),
    });
  }

  protected sortedStatuses(): Status[] {
    return [...this.statuses()].sort((a, b) => a.position - b.position);
  }

  protected handleStatusUpdated(updated: Status): void {
    this.statuses.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
  }

  protected handleStatusDeleted(statusId: string): void {
    this.statuses.update((list) => list.filter((s) => s.id !== statusId));
  }

  protected moveStatus(status: Status, direction: -1 | 1): void {
    const sorted = this.sortedStatuses();
    const index = sorted.findIndex((s) => s.id === status.id);
    const swapWith = sorted[index + direction];
    if (!swapWith) {
      return;
    }
    const previous = this.statuses();
    const newPosition = swapWith.position;
    const otherNewPosition = status.position;
    this.statuses.update((list) =>
      list.map((s) => {
        if (s.id === status.id) {
          return { ...s, position: newPosition };
        }
        if (s.id === swapWith.id) {
          return { ...s, position: otherNewPosition };
        }
        return s;
      }),
    );
    forkJoin([
      this.statusService.update(status.id, { position: newPosition }),
      this.statusService.update(swapWith.id, { position: otherNewPosition }),
    ]).subscribe({
      error: () => {
        this.statuses.set(previous);
        this.toast.error('Impossible de réordonner les colonnes.');
      },
    });
  }

  protected openAddStatus(): void {
    this.showAddStatus.set(true);
  }

  protected createStatus(value: NameColorFormValue): void {
    const board = this.board();
    if (!board) {
      return;
    }
    const lastPosition = this.statuses().reduce((max, s) => Math.max(max, s.position), 0);
    this.statusService
      .create(board.id, { name: value.name, color: value.color, position: lastPosition + 1 })
      .subscribe({
        next: (status) => {
          this.statuses.update((list) => [...list, status]);
          this.showAddStatus.set(false);
          this.toast.success(`Statut "${status.name}" ajouté.`);
        },
        error: () => this.toast.error('Impossible de créer ce statut.'),
      });
  }

  protected openTaskDetail(task: Task): void {
    this.selectedTask.set(task);
  }

  protected handleTaskUpdated(updated: Task): void {
    this.tasks.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
    this.selectedTask.set(updated);
  }

  protected handleTaskDeleted(taskId: string): void {
    this.tasks.update((list) => list.filter((t) => t.id !== taskId));
  }

  protected handleLabelCreated(label: Label): void {
    this.labels.update((list) => [...list, label]);
  }

  protected openCreateModal(): void {
    this.modalStatusId.set(this.statuses()[0]?.id ?? '');
    this.showCreateModal.set(true);
  }

  protected handleCreate(request: CreateTaskRequest): void {
    const board = this.board();
    if (!board) {
      return;
    }
    this.taskService.create(board.id, request).subscribe({
      next: (task) => {
        this.tasks.update((list) => [...list, task]);
        this.showCreateModal.set(false);
      },
      error: () => this.toast.error('Impossible de créer la tâche.'),
    });
  }
}
