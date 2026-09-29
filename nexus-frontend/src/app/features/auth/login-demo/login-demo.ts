import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthShell } from '../../../shared/components/auth-shell/auth-shell';

/**
 * Écran de connexion visuellement identique à /login, mais volontairement
 * déconnecté de AuthService/authGuard : à utiliser pour une démonstration
 * sans dépendre du backend ou du mock API. Ne pas relier au reste de l'app.
 */
@Component({
  selector: 'app-login-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, AuthShell],
  templateUrl: './login-demo.html',
})
export class LoginDemo {
  private readonly fb = new FormBuilder();

  protected readonly submitting = signal(false);
  protected readonly success = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.success.set(false);

    setTimeout(() => {
      this.submitting.set(false);
      this.success.set(true);
    }, 900);
  }
}
