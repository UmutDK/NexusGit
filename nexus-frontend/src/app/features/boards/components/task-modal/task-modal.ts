import { ChangeDetectionStrategy, Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { LucideX } from '@lucide/angular';
import { LabelService } from '../../../../core/services';
import type { CreateTaskRequest, Label, Status, TaskPriority, TeamMember } from '../../../../core/models';
import { NameColorForm, type NameColorFormValue } from '../../../../shared/components/name-color-form/name-color-form';
import { FieldValueDirective } from '../../../../shared/directives/field-value.directive';
import { TASK_PRIORITIES } from '../../../../shared/constants/task-priority';

const NEW_LABEL_OPTION = '__new__';

@Component({
  selector: 'app-task-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, LucideX, NameColorForm, FieldValueDirective],
  templateUrl: './task-modal.html',
  styleUrl: './task-modal.css',
})
export class TaskModal implements OnInit {
  readonly teamId = input.required<string>();
  readonly teamName = input.required<string>();
  readonly statuses = input.required<Status[]>();
  readonly members = input.required<TeamMember[]>();
  readonly labels = input.required<Label[]>();
  readonly defaultStatusId = input.required<string>();

  readonly create = output<CreateTaskRequest>();
  readonly closeModal = output<void>();
  readonly labelCreated = output<Label>();

  private readonly labelService = inject(LabelService);

  protected readonly availableLabels = signal<Label[]>([]);
  protected readonly showNewLabelForm = signal(false);
  protected readonly newLabelError = signal<string | null>(null);
  protected readonly newLabelOption = NEW_LABEL_OPTION;

  protected readonly priorities = TASK_PRIORITIES;

  private readonly fb = new FormBuilder();
  protected readonly form = this.fb.nonNullable.group({
    title: ['', Validators.required],
    description: [''],
    priority: ['moyenne' as TaskPriority],
    statusId: ['', Validators.required],
    assigneeId: [''],
    labelId: [''],
    dueDate: [''],
  });

  ngOnInit(): void {
    this.form.patchValue({ statusId: this.defaultStatusId() });
    this.availableLabels.set(this.labels());
  }

  protected onLabelSelectChange(value: string): void {
    this.showNewLabelForm.set(value === NEW_LABEL_OPTION);
  }

  protected cancelNewLabel(): void {
    this.showNewLabelForm.set(false);
    this.newLabelError.set(null);
    this.form.patchValue({ labelId: '' });
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
        this.form.patchValue({ labelId: label.id });
        this.showNewLabelForm.set(false);
        this.labelCreated.emit(label);
      });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const request: CreateTaskRequest = {
      statusId: value.statusId,
      title: value.title,
      description: value.description || undefined,
      priority: value.priority,
      dueDate: value.dueDate || undefined,
      assigneeIds: value.assigneeId ? [value.assigneeId] : undefined,
      labelIds: value.labelId ? [value.labelId] : undefined,
    };
    this.create.emit(request);
  }
}
