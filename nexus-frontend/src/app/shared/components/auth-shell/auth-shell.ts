import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideZap } from '@lucide/angular';

@Component({
  selector: 'app-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideZap],
  templateUrl: './auth-shell.html',
  styleUrl: './auth-shell.css',
})
export class AuthShell {
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
}
