import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin, catchError, of } from 'rxjs';
import { LucideLogOut, LucideMail, LucideUserPlus, LucideUsers, LucideX } from '@lucide/angular';
import { AuthService, CurrentTeamService, DialogService, TeamService, ToastService } from '../../core/services';
import type { Invitation, TeamMember, TeamRole } from '../../core/models';
import { Avatar } from '../../shared/components/avatar/avatar';
import { FieldValueDirective } from '../../shared/directives/field-value.directive';

@Component({
  selector: 'app-teams',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    Avatar,
    FieldValueDirective,
    LucideUsers,
    LucideUserPlus,
    LucideMail,
    LucideX,
    LucideLogOut,
  ],
  templateUrl: './teams.html',
  styleUrl: './teams.css',
})
export class Teams {
  private readonly currentTeamService = inject(CurrentTeamService);
  private readonly teamService = inject(TeamService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly fb = new FormBuilder();

  protected readonly currentUser = this.authService.currentUser;
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly team = this.currentTeamService.currentTeam;
  protected readonly members = signal<TeamMember[]>([]);
  protected readonly invitations = signal<Invitation[]>([]);
  protected readonly inviteError = signal<string | null>(null);
  protected readonly savingDueSoonDays = signal(false);

  protected readonly isCoordinator = computed(() => this.team()?.myRole === 'coordinator');
  protected readonly canLeaveTeam = computed(() => {
    if (!this.isCoordinator()) {
      return true;
    }
    return this.members().filter((m) => m.role === 'coordinator').length > 1;
  });

  protected readonly createTeamForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
  });

  protected readonly inviteForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly dueSoonDaysControl = this.fb.nonNullable.control(2, [Validators.required, Validators.min(1)]);

  constructor() {
    this.currentTeamService.ensureLoaded().subscribe();

    effect(() => {
      const team = this.team();
      if (team) {
        untracked(() => {
          this.dueSoonDaysControl.setValue(team.dueSoonDays);
          this.loadMembers(team.id);
        });
      } else if (!this.currentTeamService.loading()) {
        untracked(() => {
          this.members.set([]);
          this.invitations.set([]);
          this.loading.set(false);
        });
      }
    });
  }

  private loadMembers(teamId: string): void {
    this.loading.set(true);
    forkJoin({
      members: this.teamService.listMembers(teamId),
      invitations: this.teamService.listInvitations(teamId),
    })
      .pipe(
        catchError(() => {
          this.error.set('Impossible de charger les membres de l’équipe.');
          return of(null);
        }),
      )
      .subscribe((result) => {
        if (result) {
          this.members.set(result.members);
          this.invitations.set(result.invitations);
        }
        this.loading.set(false);
      });
  }

  createTeam(): void {
    if (this.createTeamForm.invalid) {
      this.createTeamForm.markAllAsTouched();
      return;
    }
    this.teamService
      .create(this.createTeamForm.getRawValue())
      .pipe(
        catchError(() => {
          this.toast.error("Impossible de créer l'équipe.");
          return of(null);
        }),
      )
      .subscribe((team) => {
        if (team) {
          this.currentTeamService.addTeam(team);
          this.toast.success(`Équipe "${team.name}" créée.`);
        }
      });
  }

  invite(): void {
    const team = this.team();
    if (!team || this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }
    this.inviteError.set(null);
    const email = this.inviteForm.getRawValue().email;
    this.teamService
      .invite(team.id, this.inviteForm.getRawValue())
      .pipe(
        catchError(() => {
          this.inviteError.set("Impossible d'envoyer l'invitation.");
          return of(null);
        }),
      )
      .subscribe((invitation) => {
        if (invitation) {
          this.invitations.update((list) => [...list, invitation]);
          this.inviteForm.reset();
          this.toast.success(`Invitation envoyée à ${email}.`);
        }
      });
  }

  changeRole(userId: string, role: TeamRole): void {
    const team = this.team();
    if (!team) {
      return;
    }
    this.teamService
      .updateMemberRole(team.id, userId, role)
      .pipe(
        catchError(() => {
          this.toast.error('Impossible de modifier ce rôle.');
          return of(null);
        }),
      )
      .subscribe((updated) => {
        if (updated) {
          this.members.update((list) =>
            list.map((m) => (m.user.id === userId ? { ...m, role: updated.role } : m)),
          );
        }
      });
  }

  onRoleChange(userId: string, value: string): void {
    this.changeRole(userId, value as TeamRole);
  }

  removeMember(userId: string): void {
    const team = this.team();
    if (!team) {
      return;
    }
    const memberName = this.members().find((m) => m.user.id === userId)?.user.name;
    this.teamService.removeMember(team.id, userId).subscribe({
      next: () => {
        this.members.update((list) => list.filter((m) => m.user.id !== userId));
        this.toast.success(memberName ? `${memberName} a été retiré de l'équipe.` : 'Membre retiré.');
      },
      error: () => this.toast.error('Impossible de retirer ce membre.'),
    });
  }

  revokeInvitation(invitationId: string): void {
    const team = this.team();
    if (!team) {
      return;
    }
    this.teamService.revokeInvitation(team.id, invitationId).subscribe({
      next: (updated) => {
        this.invitations.update((list) => list.map((i) => (i.id === invitationId ? updated : i)));
        this.toast.success('Invitation annulée.');
      },
      error: () => this.toast.error("Impossible d'annuler l'invitation."),
    });
  }

  async leaveTeam(): Promise<void> {
    const team = this.team();
    const user = this.currentUser();
    if (!team || !user || !this.canLeaveTeam()) {
      return;
    }
    const confirmed = await this.dialog.confirm(`Quitter l'équipe "${team.name}" ?`, { danger: true });
    if (!confirmed) {
      return;
    }
    this.teamService.removeMember(team.id, user.id).subscribe({
      next: () => {
        this.currentTeamService.removeTeam(team.id);
        this.toast.success(`Tu as quitté "${team.name}".`);
      },
      error: () => this.toast.error("Impossible de quitter l'équipe."),
    });
  }

  saveDueSoonDays(): void {
    const team = this.team();
    if (this.dueSoonDaysControl.invalid) {
      this.dueSoonDaysControl.markAsTouched();
      return;
    }
    if (!team) {
      return;
    }
    this.savingDueSoonDays.set(true);
    this.teamService
      .update(team.id, { dueSoonDays: this.dueSoonDaysControl.value })
      .pipe(
        catchError(() => {
          this.toast.error('Impossible d’enregistrer ce réglage.');
          return of(null);
        }),
      )
      .subscribe((updated) => {
        this.savingDueSoonDays.set(false);
        if (updated) {
          this.currentTeamService.updateTeam(updated);
          this.toast.success('Réglage enregistré.');
        }
      });
  }
}
