import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { CdkDrag, CdkDropList, CdkDragDrop } from '@angular/cdk/drag-drop';
import { LucideChevronLeft, LucideChevronRight, LucidePencil, LucideTrash2 } from '@lucide/angular';
import { DialogService, StatusService, ToastService } from '../../../../core/services';
import type { Status, Task } from '../../../../core/models';
import { TaskCard } from '../task-card/task-card';
import { NameColorForm, type NameColorFormValue } from '../../../../shared/components/name-color-form/name-color-form';
import { FieldValueDirective } from '../../../../shared/directives/field-value.directive';

@Component({
  selector: 'app-status-column',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDropList, CdkDrag, TaskCard, NameColorForm, FieldValueDirective, LucideChevronLeft, LucideChevronRight, LucidePencil, LucideTrash2],
  templateUrl: './status-column.html',
  styleUrl: './status-column.css',
})
export class StatusColumn {
  private readonly statusService = inject(StatusService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);

  readonly status = input.required<Status>();
  readonly tasks = input.required<Task[]>();
  readonly isCoordinator = input.required<boolean>();
  readonly canMoveLeft = input.required<boolean>();
  readonly canMoveRight = input.required<boolean>();

  readonly moveLeft = output<void>();
  readonly moveRight = output<void>();
  readonly taskOpen = output<Task>();
  readonly taskDrop = output<CdkDragDrop<Task[]>>();
  readonly updated = output<Status>();
  readonly deleted = output<string>();

  protected readonly editing = signal(false);
  protected readonly draftTerminal = signal(false);

  protected startEdit(): void {
    this.editing.set(true);
    this.draftTerminal.set(this.status().isTerminal);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
  }

  protected saveEdit(value: NameColorFormValue): void {
    this.statusService
      .update(this.status().id, { name: value.name, color: value.color, isTerminal: this.draftTerminal() })
      .subscribe({
        next: (updated) => {
          this.updated.emit(updated);
          this.editing.set(false);
          this.toast.success('Statut mis à jour.');
        },
        error: () => this.toast.error('Impossible de mettre à jour ce statut.'),
      });
  }

  protected async delete(): Promise<void> {
    if (this.tasks().length > 0) {
      await this.dialog.alert('Déplace ou supprime les tâches de cette colonne avant de la supprimer.');
      return;
    }
    const confirmed = await this.dialog.confirm(`Supprimer la colonne "${this.status().name}" ?`, {
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    const statusId = this.status().id;
    const statusName = this.status().name;
    this.statusService.delete(statusId).subscribe({
      next: () => {
        this.deleted.emit(statusId);
        this.toast.success(`Colonne "${statusName}" supprimée.`);
      },
      error: () => this.toast.error('Impossible de supprimer cette colonne.'),
    });
  }
}
