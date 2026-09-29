import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucidePencil, LucideX } from '@lucide/angular';
import { AuthService, ToastService } from '../../../core/services';
import type { UpdateAccountRequest } from '../../../core/models';
import { Avatar } from '../avatar/avatar';

/** Menu "Mon compte" de la barre du haut : affiche le nom et l'email, et permet de les modifier. */
@Component({
  selector: 'app-account-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Avatar, LucidePencil, LucideX],
  templateUrl: './account-panel.html',
  styleUrl: './account-panel.css',
  host: { '(document:keydown.escape)': 'close()' },
})
export class AccountPanel {
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly fb = new FormBuilder();

  protected readonly currentUser = this.authService.currentUser;
  protected readonly open = signal(false);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    currentPassword: [''],
  });

  protected readonly memberSince = computed(() => {
    const createdAt = this.currentUser()?.createdAt;
    return createdAt
      ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(createdAt))
      : '';
  });

  private readonly emailValue = toSignal(this.form.controls.email.valueChanges, { initialValue: '' });

  /** Le mot de passe n'est demandé que si l'email change (c'est l'identifiant de connexion). */
  protected readonly emailChanged = computed(
    () => this.emailValue().trim().toLowerCase() !== (this.currentUser()?.email ?? ''),
  );

  toggle(): void {
    if (this.open()) {
      this.close();
    } else {
      this.open.set(true);
    }
  }

  close(): void {
    this.open.set(false);
    this.editing.set(false);
    this.error.set(null);
  }

  protected startEdit(): void {
    const user = this.currentUser();
    if (!user) {
      return;
    }
    this.form.reset({ name: user.name, email: user.email, currentPassword: '' });
    this.error.set(null);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
    this.error.set(null);
  }

  protected save(): void {
    const user = this.currentUser();
    if (!user) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, email, currentPassword } = this.form.getRawValue();
    const request: UpdateAccountRequest = {};
    if (name.trim() !== user.name) {
      request.name = name.trim();
    }
    if (this.emailChanged()) {
      if (!currentPassword) {
        this.error.set("Saisis ton mot de passe actuel pour changer d'email.");
        return;
      }
      request.email = email.trim();
      request.currentPassword = currentPassword;
    }
    if (Object.keys(request).length === 0) {
      this.editing.set(false);
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.authService.updateAccount(request).subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(false);
        this.toast.success('Profil mis à jour.');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(this.errorMessage(err));
      },
    });
  }

  private errorMessage(err: unknown): string {
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    switch (status) {
      case 403:
        return 'Mot de passe actuel incorrect.';
      case 409:
        return 'Cet email est déjà utilisé par un autre compte.';
      case 400:
        return 'Nom ou email invalide.';
      default:
        return "Impossible d'enregistrer les modifications.";
    }
  }
}
