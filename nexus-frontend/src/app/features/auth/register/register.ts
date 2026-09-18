import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../../core/services';
import { AuthShell } from '../../../shared/components/auth-shell/auth-shell';

@Component({
  selector: 'app-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShell],
  templateUrl: './register.html',
})
export class Register {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = new FormBuilder();

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    this.authService
      .register(this.form.getRawValue())
      .pipe(
        catchError(() => {
          this.error.set('Impossible de créer le compte. Cet email est peut-être déjà utilisé.');
          return of(null);
        }),
      )
      .subscribe((response) => {
        this.submitting.set(false);
        if (response) {
          this.router.navigateByUrl(this.returnUrl || '/dashboard');
        }
      });
  }
}
