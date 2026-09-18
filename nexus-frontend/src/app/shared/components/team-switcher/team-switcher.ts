import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { LucideCheck, LucideChevronDown, LucidePlus, LucideUsers } from '@lucide/angular';
import { CurrentTeamService, TeamService } from '../../../core/services';
import { FieldValueDirective } from '../../directives/field-value.directive';

@Component({
  selector: 'app-team-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideCheck, LucideChevronDown, LucidePlus, LucideUsers, FieldValueDirective],
  templateUrl: './team-switcher.html',
  styleUrl: './team-switcher.css',
})
export class TeamSwitcher implements OnInit {
  protected readonly currentTeamService = inject(CurrentTeamService);
  private readonly teamService = inject(TeamService);

  protected readonly open = signal(false);
  protected readonly showCreateForm = signal(false);
  protected readonly newTeamName = signal('');
  protected readonly creating = signal(false);

  ngOnInit(): void {
    this.currentTeamService.ensureLoaded().subscribe();
  }

  toggle(): void {
    this.open.update((v) => !v);
    if (!this.open()) {
      this.showCreateForm.set(false);
    }
  }

  close(): void {
    this.open.set(false);
    this.showCreateForm.set(false);
  }

  select(teamId: string): void {
    this.currentTeamService.selectTeam(teamId);
    this.close();
  }

  startCreate(): void {
    this.newTeamName.set('');
    this.showCreateForm.set(true);
  }

  createTeam(): void {
    const name = this.newTeamName().trim();
    if (!name || this.creating()) {
      return;
    }
    this.creating.set(true);
    this.teamService.create({ name }).subscribe({
      next: (team) => {
        this.currentTeamService.addTeam(team);
        this.creating.set(false);
        this.close();
      },
      error: () => this.creating.set(false),
    });
  }
}
