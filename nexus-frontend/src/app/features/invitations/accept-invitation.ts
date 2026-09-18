import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService, TeamService } from '../../core/services';
import type { Team } from '../../core/models';
import { AuthShell } from '../../shared/components/auth-shell/auth-shell';

@Component({
  selector: 'app-accept-invitation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AuthShell],
  templateUrl: './accept-invitation.html',
  styleUrl: './accept-invitation.css',
})
export class AcceptInvitation implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly teamService = inject(TeamService);

  protected readonly loading = signal(true);
  protected readonly needsAuth = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly team = signal<Team | null>(null);
  protected readonly authUrl = signal('');

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    const returnUrl = `/invitations/${token}`;
    this.authUrl.set(returnUrl);

    if (!this.authService.isAuthenticated()) {
      this.needsAuth.set(true);
      this.loading.set(false);
      return;
    }

    this.teamService
      .acceptInvitation(token)
      .pipe(
        catchError(() => {
          this.error.set("Ce lien d'invitation est invalide, expiré ou déjà utilisé.");
          return of(null);
        }),
      )
      .subscribe((team) => {
        this.team.set(team);
        this.loading.set(false);
      });
  }

  goToDashboard(): void {
    this.router.navigateByUrl('/dashboard');
  }
}
