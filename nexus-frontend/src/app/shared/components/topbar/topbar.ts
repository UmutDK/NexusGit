import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideCalendar,
  LucideLayoutDashboard,
  LucideListChecks,
  LucideLogOut,
  LucideMenu,
  LucideTimer,
  LucideUsers,
  LucideX,
  LucideZap,
} from '@lucide/angular';
import { AuthService, CurrentTeamService } from '../../../core/services';
import { Avatar } from '../avatar/avatar';
import { NotificationsPanel } from '../notifications-panel/notifications-panel';
import { TeamSwitcher } from '../team-switcher/team-switcher';

@Component({
  selector: 'app-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    Avatar,
    NotificationsPanel,
    TeamSwitcher,
    LucideZap,
    LucideLayoutDashboard,
    LucideListChecks,
    LucideLogOut,
    LucideUsers,
    LucideMenu,
    LucideX,
    LucideTimer,
    LucideCalendar,
  ],
  templateUrl: './topbar.html',
  styleUrl: './topbar.css',
})
export class Topbar {
  private readonly authService = inject(AuthService);
  private readonly currentTeamService = inject(CurrentTeamService);
  private readonly router = inject(Router);

  protected readonly currentUser = this.authService.currentUser;
  protected readonly mobileMenuOpen = signal(false);

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((v) => !v);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  logout(): void {
    this.authService.logout();
    this.currentTeamService.reset();
    this.router.navigateByUrl('/login');
  }
}
