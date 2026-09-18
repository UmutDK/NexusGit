import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DialogService } from '../../../core/services';

@Component({
  selector: 'app-dialog-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dialog-container.html',
  styleUrl: './dialog-container.css',
})
export class DialogContainer {
  protected readonly dialogService = inject(DialogService);

  protected confirm(): void {
    this.dialogService.respond(true);
  }

  protected cancel(): void {
    this.dialogService.respond(false);
  }
}
