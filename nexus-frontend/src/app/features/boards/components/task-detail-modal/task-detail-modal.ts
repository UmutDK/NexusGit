import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, catchError, of } from 'rxjs';
import {
  LucideBellRing,
  LucideCirclePause,
  LucideCirclePlay,
  LucideClock,
  LucideLink,
  LucidePencil,
  LucidePlus,
  LucideRepeat,
  LucideTrash2,
  LucideX,
} from '@lucide/angular';
import {
  ActivityService,
  AuthService,
  ChecklistService,
  CommentService,
  CurrentTeamService,
  DialogService,
  LabelService,
  TaskLinkService,
  TaskNoteService,
  TaskRecurrenceService,
  TaskService,
  TickerService,
  TimeTrackingService,
  ToastService,
} from '../../../../core/services';
import type {
  ActivityLogEntry,
  Comment as TaskComment,
  Label,
  RecurrenceUnit,
  Status,
  Task,
  TaskPriority,
  TeamMember,
} from '../../../../core/models';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { LabelPill } from '../../../../shared/components/label-pill/label-pill';
import { NameColorForm, type NameColorFormValue } from '../../../../shared/components/name-color-form/name-color-form';
import { FieldValueDirective } from '../../../../shared/directives/field-value.directive';
import { TASK_PRIORITIES } from '../../../../shared/constants/task-priority';
import { formatClock, formatDuration } from '../../../../shared/utils/duration.util';
import { formatRecurrence, nextOccurrence } from '../../../../shared/utils/recurrence.util';

const RECURRENCE_UNITS: { value: RecurrenceUnit; label: string }[] = [
  { value: 'day', label: 'jour(s)' },
  { value: 'week', label: 'semaine(s)' },
  { value: 'month', label: 'mois' },
];

@Component({
  selector: 'app-task-detail-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    DatePipe,
    Avatar,
    LabelPill,
    NameColorForm,
    FieldValueDirective,
    LucideX,
    LucideTrash2,
    LucideClock,
    LucideBellRing,
    LucidePlus,
    LucideCirclePlay,
    LucideCirclePause,
    LucideLink,
    LucideRepeat,
    LucidePencil,
  ],
  templateUrl: './task-detail-modal.html',
  styleUrl: './task-detail-modal.css',
})
export class TaskDetailModal implements OnInit {
  readonly task = input.required<Task>();
  readonly teamId = input.required<string>();
  readonly statuses = input.required<Status[]>();
  readonly members = input.required<TeamMember[]>();
  readonly labels = input.required<Label[]>();
  readonly isCoordinator = input.required<boolean>();

  readonly closeModal = output<void>();
  readonly updated = output<Task>();
  readonly deleted = output<string>();
  readonly labelCreated = output<Label>();

  private readonly taskService = inject(TaskService);
  private readonly commentService = inject(CommentService);
  private readonly activityService = inject(ActivityService);
  private readonly authService = inject(AuthService);
  private readonly labelService = inject(LabelService);
  private readonly timeTracking = inject(TimeTrackingService);
  private readonly currentTeamService = inject(CurrentTeamService);
  private readonly ticker = inject(TickerService);
  private readonly checklist = inject(ChecklistService);
  private readonly taskLinks = inject(TaskLinkService);
  private readonly taskNotes = inject(TaskNoteService);
  private readonly taskRecurrence = inject(TaskRecurrenceService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);

  protected readonly formatDuration = formatDuration;

  protected readonly currentUser = this.authService.currentUser;
  protected readonly currentTask = signal<Task | null>(null);
  protected readonly comments = signal<TaskComment[]>([]);
  protected readonly activity = signal<ActivityLogEntry[]>([]);
  protected readonly loadingSide = signal(true);

  protected readonly descriptionDraft = signal('');
  protected readonly descriptionDirty = signal(false);
  protected readonly noteDraft = signal('');
  protected readonly noteDirty = signal(false);
  protected readonly noteUpdatedAt = signal<string | null>(null);
  protected readonly newComment = signal('');
  protected readonly editingCommentId = signal<string | null>(null);
  protected readonly editingCommentBody = signal('');

  protected readonly remindingUserId = signal<string | null>(null);
  protected readonly remindMessage = signal('');
  protected readonly justRemindedUserId = signal<string | null>(null);

  protected readonly availableLabels = signal<Label[]>([]);
  protected readonly showNewLabelForm = signal(false);
  protected readonly newLabelError = signal<string | null>(null);

  protected readonly newChecklistItem = signal('');
  protected readonly checklistItems = computed(() => this.checklist.itemsForTask(this.task().id));
  protected readonly checklistProgress = computed(() => this.checklist.progressForTask(this.task().id));

  protected readonly links = computed(() => this.taskLinks.linksForTask(this.task().id));
  protected readonly showLinkForm = signal(false);
  protected readonly newLinkName = signal('');
  protected readonly newLinkUrl = signal('');

  protected readonly recurrenceUnits = RECURRENCE_UNITS;
  protected readonly recurrenceRule = computed(() => this.taskRecurrence.ruleForTask(this.task().id));
  protected readonly showRecurrenceForm = signal(false);
  protected readonly recurrenceIntervalDraft = signal(1);
  protected readonly recurrenceUnitDraft = signal<RecurrenceUnit>('day');
  protected readonly formatRecurrence = formatRecurrence;

  protected readonly nextOccurrenceLabel = computed(() => {
    const rule = this.recurrenceRule();
    if (!rule) {
      return null;
    }
    const task = this.currentTask() ?? this.task();
    const anchor = task.dueDate ? new Date(task.dueDate) : new Date(task.createdAt);
    const next = nextOccurrence(anchor, rule.interval, rule.unit);
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(next);
  });

  protected readonly priorities = TASK_PRIORITIES;

  protected readonly taskEntries = computed(() => this.timeTracking.entriesForTask(this.task().id));

  protected readonly myActiveEntry = computed(() => {
    const entry = this.timeTracking.activeEntryForTask(this.task().id);
    return entry && entry.userId === this.currentUser()?.id ? entry : null;
  });

  protected readonly otherActiveEntry = computed(() => {
    const entry = this.timeTracking.activeEntryForTask(this.task().id);
    return entry && entry.userId !== this.currentUser()?.id ? entry : null;
  });

  protected readonly totalSecondsForTask = computed(() => {
    const now = this.ticker.now();
    return this.taskEntries().reduce(
      (sum, e) => sum + (e.durationSeconds ?? Math.max(0, (now - new Date(e.startedAt).getTime()) / 1000)),
      0,
    );
  });

  protected liveElapsedSeconds(startedAt: string): number {
    return Math.max(0, (this.ticker.now() - new Date(startedAt).getTime()) / 1000);
  }

  protected formatClock(startedAt: string): string {
    return formatClock(this.liveElapsedSeconds(startedAt));
  }

  protected toggleTimer(): void {
    const task = this.currentTask() ?? this.task();
    if (this.myActiveEntry()) {
      this.timeTracking.stop(task.id);
      return;
    }
    const teamId = this.teamId() || this.currentTeamService.currentTeamId();
    if (teamId) {
      this.timeTracking.start(task, teamId);
    }
  }

  protected readonly showManualEntryForm = signal(false);
  protected readonly manualDate = signal('');
  protected readonly manualStartTime = signal('');
  protected readonly manualEndTime = signal('');
  protected readonly manualEntryError = signal<string | null>(null);

  protected openManualEntryForm(): void {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    this.manualDate.set(`${y}-${m}-${d}`);
    this.manualStartTime.set('');
    this.manualEndTime.set('');
    this.manualEntryError.set(null);
    this.showManualEntryForm.set(true);
  }

  protected cancelManualEntryForm(): void {
    this.showManualEntryForm.set(false);
  }

  protected saveManualEntry(): void {
    const date = this.manualDate();
    const startTime = this.manualStartTime();
    const endTime = this.manualEndTime();
    if (!date || !startTime || !endTime) {
      this.manualEntryError.set("Renseigne la date, l'heure de début et l'heure de fin.");
      return;
    }

    const startedAt = new Date(`${date}T${startTime}`);
    const endedAt = new Date(`${date}T${endTime}`);
    if (isNaN(startedAt.getTime()) || isNaN(endedAt.getTime())) {
      this.manualEntryError.set('Date ou heure invalide.');
      return;
    }
    if (endedAt <= startedAt) {
      this.manualEntryError.set("L'heure de fin doit être après l'heure de début.");
      return;
    }

    const teamId = this.teamId() || this.currentTeamService.currentTeamId();
    if (!teamId) {
      return;
    }
    this.timeTracking.addManualEntry(this.currentTask() ?? this.task(), teamId, startedAt.toISOString(), endedAt.toISOString());
    this.showManualEntryForm.set(false);
    this.toast.success('Session ajoutée.');
  }

  ngOnInit(): void {
    this.currentTask.set(this.task());
    this.descriptionDraft.set(this.task().description ?? '');
    this.availableLabels.set(this.labels());

    const note = this.taskNotes.noteForTask(this.task().id);
    this.noteDraft.set(note?.text ?? '');
    this.noteUpdatedAt.set(note?.updatedAt ?? null);

    forkJoin({
      comments: this.commentService.listForTask(this.task().id),
      activity: this.activityService.listForTask(this.task().id),
    })
      .pipe(catchError(() => of({ comments: [], activity: [] })))
      .subscribe(({ comments, activity }) => {
        this.comments.set(comments);
        this.activity.set(activity);
        this.loadingSide.set(false);
      });
  }

  private applyUpdate(updated: Task): void {
    this.currentTask.set(updated);
    this.updated.emit(updated);
  }

  protected isAssigned(userId: string): boolean {
    return this.currentTask()!.assignees.some((a) => a.id === userId);
  }

  protected isLabeled(labelId: string): boolean {
    return this.currentTask()!.labels.some((l) => l.id === labelId);
  }

  protected setTitle(title: string): void {
    if (!title.trim() || title === this.currentTask()!.title) {
      return;
    }
    this.taskService.update(this.currentTask()!.id, { title }).subscribe({
      next: (t) => this.applyUpdate(t),
      error: () => this.toast.error('Impossible de renommer la tâche.'),
    });
  }

  protected onDescriptionInput(value: string): void {
    this.descriptionDraft.set(value);
    this.descriptionDirty.set(value !== (this.currentTask()!.description ?? ''));
  }

  protected saveDescription(): void {
    this.taskService.update(this.currentTask()!.id, { description: this.descriptionDraft() }).subscribe({
      next: (t) => {
        this.applyUpdate(t);
        this.descriptionDirty.set(false);
      },
      error: () => this.toast.error('Impossible d’enregistrer la description.'),
    });
  }

  protected onNoteInput(value: string): void {
    this.noteDraft.set(value);
    this.noteDirty.set(true);
  }

  protected saveNote(): void {
    this.taskNotes.saveNote(this.task().id, this.noteDraft());
    this.noteUpdatedAt.set(new Date().toISOString());
    this.noteDirty.set(false);
  }

  protected setPriority(priority: TaskPriority): void {
    this.taskService.update(this.currentTask()!.id, { priority }).subscribe({
      next: (t) => this.applyUpdate(t),
      error: () => this.toast.error('Impossible de changer la priorité.'),
    });
  }

  protected onPriorityChange(value: string): void {
    this.setPriority(value as TaskPriority);
  }

  protected setStatus(statusId: string): void {
    this.taskService.update(this.currentTask()!.id, { statusId }).subscribe({
      next: (t) => this.applyUpdate(t),
      error: () => this.toast.error('Impossible de changer le statut.'),
    });
  }

  protected setDueDate(dueDate: string): void {
    this.taskService.update(this.currentTask()!.id, { dueDate: dueDate || null }).subscribe({
      next: (t) => this.applyUpdate(t),
      error: () => this.toast.error('Impossible de changer l’échéance.'),
    });
  }

  protected toggleAssignee(userId: string): void {
    const current = this.currentTask()!.assignees.map((a) => a.id);
    const next = current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId];
    this.taskService.setAssignees(this.currentTask()!.id, { userIds: next }).subscribe({
      next: (t) => this.applyUpdate(t),
      error: () => this.toast.error('Impossible de modifier les assignés.'),
    });
  }

  protected toggleLabel(labelId: string): void {
    const current = this.currentTask()!.labels.map((l) => l.id);
    const next = current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId];
    this.taskService.setLabels(this.currentTask()!.id, { labelIds: next }).subscribe({
      next: (t) => this.applyUpdate(t),
      error: () => this.toast.error('Impossible de modifier les étiquettes.'),
    });
  }

  protected createLabel(value: NameColorFormValue): void {
    this.newLabelError.set(null);
    this.labelService
      .create(this.teamId(), value)
      .pipe(
        catchError(() => {
          this.newLabelError.set('Une étiquette avec ce nom existe déjà.');
          return of(null);
        }),
      )
      .subscribe((label) => {
        if (!label) {
          return;
        }
        this.availableLabels.update((list) => [...list, label]);
        this.showNewLabelForm.set(false);
        this.labelCreated.emit(label);
        this.toggleLabel(label.id);
      });
  }

  protected addChecklistItem(): void {
    this.checklist.addItem(this.task().id, this.newChecklistItem());
    this.newChecklistItem.set('');
  }

  protected toggleChecklistItem(itemId: string): void {
    this.checklist.toggleItem(itemId);
  }

  protected deleteChecklistItem(itemId: string): void {
    this.checklist.deleteItem(itemId);
  }

  protected openLinkForm(): void {
    this.showLinkForm.set(true);
  }

  protected cancelLinkForm(): void {
    this.showLinkForm.set(false);
    this.newLinkName.set('');
    this.newLinkUrl.set('');
  }

  protected addLink(): void {
    if (!this.newLinkUrl().trim()) {
      return;
    }
    this.taskLinks.addLink(this.task().id, this.newLinkName(), this.newLinkUrl());
    this.cancelLinkForm();
  }

  protected deleteLink(linkId: string): void {
    this.taskLinks.deleteLink(linkId);
  }

  protected openRecurrenceForm(): void {
    const rule = this.recurrenceRule();
    this.recurrenceIntervalDraft.set(rule?.interval ?? 1);
    this.recurrenceUnitDraft.set(rule?.unit ?? 'day');
    this.showRecurrenceForm.set(true);
  }

  protected cancelRecurrenceForm(): void {
    this.showRecurrenceForm.set(false);
  }

  protected onRecurrenceIntervalChange(value: string): void {
    const parsed = parseInt(value, 10);
    this.recurrenceIntervalDraft.set(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
  }

  protected onRecurrenceUnitChange(value: string): void {
    this.recurrenceUnitDraft.set(value as RecurrenceUnit);
  }

  protected saveRecurrence(): void {
    this.taskRecurrence.setRule(this.task().id, this.recurrenceIntervalDraft(), this.recurrenceUnitDraft());
    this.showRecurrenceForm.set(false);
  }

  protected removeRecurrence(): void {
    this.taskRecurrence.clearRule(this.task().id);
    this.showRecurrenceForm.set(false);
  }

  protected addComment(): void {
    const body = this.newComment().trim();
    if (!body) {
      return;
    }
    this.commentService.create(this.currentTask()!.id, { body }).subscribe({
      next: (comment) => {
        this.comments.update((list) => [...list, comment]);
        this.newComment.set('');
      },
      error: () => this.toast.error("Impossible d'ajouter le commentaire."),
    });
  }

  protected startEditComment(comment: TaskComment): void {
    this.editingCommentId.set(comment.id);
    this.editingCommentBody.set(comment.body);
  }

  protected saveEditComment(): void {
    const id = this.editingCommentId();
    if (!id) {
      return;
    }
    this.commentService.update(id, { body: this.editingCommentBody() }).subscribe({
      next: (updated) => {
        this.comments.update((list) => list.map((c) => (c.id === id ? updated : c)));
        this.editingCommentId.set(null);
      },
      error: () => this.toast.error('Impossible de modifier ce commentaire.'),
    });
  }

  protected deleteComment(commentId: string): void {
    this.commentService.delete(commentId).subscribe({
      next: () => this.comments.update((list) => list.filter((c) => c.id !== commentId)),
      error: () => this.toast.error('Impossible de supprimer ce commentaire.'),
    });
  }

  protected startRemind(userId: string): void {
    this.remindingUserId.set(userId);
    this.remindMessage.set('');
  }

  protected cancelRemind(): void {
    this.remindingUserId.set(null);
  }

  protected sendRemind(userId: string): void {
    const message = this.remindMessage().trim();
    this.taskService.remind(this.currentTask()!.id, { userId, message: message || undefined }).subscribe({
      next: () => {
        this.remindingUserId.set(null);
        this.justRemindedUserId.set(userId);
        setTimeout(() => {
          if (this.justRemindedUserId() === userId) {
            this.justRemindedUserId.set(null);
          }
        }, 3000);
      },
      error: () => this.toast.error("Impossible d'envoyer le rappel."),
    });
  }

  protected async deleteTask(): Promise<void> {
    const confirmed = await this.dialog.confirm('Supprimer définitivement cette tâche ?', { danger: true });
    if (!confirmed) {
      return;
    }
    const id = this.currentTask()!.id;
    this.taskService.delete(id).subscribe({
      next: () => {
        this.deleted.emit(id);
        this.closeModal.emit();
        this.toast.success('Tâche supprimée.');
      },
      error: () => this.toast.error('Impossible de supprimer cette tâche.'),
    });
  }

  protected activityLabel(entry: ActivityLogEntry): string {
    const meta = entry.metadata ?? {};
    switch (entry.actionType) {
      case 'task_created':
        return 'a créé la tâche';
      case 'status_changed':
        return `a changé le statut : ${meta['fromStatus'] ?? '?'} → ${meta['toStatus'] ?? '?'}`;
      case 'priority_changed':
        return `a changé la priorité : ${meta['fromPriority'] ?? '?'} → ${meta['toPriority'] ?? '?'}`;
      case 'assigned':
        return `a assigné ${meta['userName'] ?? 'un membre'}`;
      case 'unassigned':
        return `a retiré ${meta['userName'] ?? 'un membre'} de la tâche`;
      case 'label_added':
        return `a ajouté l'étiquette "${meta['labelName'] ?? ''}"`;
      case 'label_removed':
        return `a retiré l'étiquette "${meta['labelName'] ?? ''}"`;
      case 'comment_added':
        return 'a ajouté un commentaire';
      default:
        return entry.actionType;
    }
  }
}
