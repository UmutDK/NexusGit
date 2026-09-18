import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LucideClock, LucideFileSpreadsheet, LucideListChecks, LucideTimer, LucideUsers } from '@lucide/angular';
import { CurrentTeamService, TickerService, TimeTrackingService, ToastService } from '../../core/services';
import type { TimeEntry } from '../../core/models';
import { Avatar } from '../../shared/components/avatar/avatar';
import { FieldValueDirective } from '../../shared/directives/field-value.directive';
import { formatDuration } from '../../shared/utils/duration.util';
import { buildExcelWorkbook, downloadExcelWorkbook, type ExcelCell } from '../../shared/utils/excel-export.util';

type Period = 'today' | '7d' | '30d' | 'all';

interface GroupTotal {
  key: string;
  label: string;
  totalSeconds: number;
  entryCount: number;
}

/** Tracks a checkbox selection over whatever rows are currently visible in a table. */
class RowSelection {
  private readonly ids = signal<Set<string>>(new Set());

  readonly count = computed(() => this.ids().size);

  isSelected(id: string): boolean {
    return this.ids().has(id);
  }

  allSelected(visibleIds: string[]): boolean {
    return visibleIds.length > 0 && visibleIds.every((id) => this.ids().has(id));
  }

  toggleAll(checked: boolean, visibleIds: string[]): void {
    this.ids.set(checked ? new Set(visibleIds) : new Set());
  }

  toggleOne(id: string, checked: boolean): void {
    this.ids.update((set) => {
      const next = new Set(set);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  clear(): void {
    this.ids.set(new Set());
  }
}

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: "Aujourd'hui" },
  { value: '7d', label: '7 derniers jours' },
  { value: '30d', label: '30 derniers jours' },
  { value: 'all', label: 'Tout' },
];

@Component({
  selector: 'app-time-tracking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    Avatar,
    FieldValueDirective,
    LucideClock,
    LucideUsers,
    LucideListChecks,
    LucideTimer,
    LucideFileSpreadsheet,
  ],
  templateUrl: './time-tracking.html',
  styleUrl: './time-tracking.css',
})
export class TimeTracking {
  private readonly currentTeamService = inject(CurrentTeamService);
  private readonly timeTracking = inject(TimeTrackingService);
  private readonly ticker = inject(TickerService);
  private readonly toast = inject(ToastService);

  protected readonly team = this.currentTeamService.currentTeam;
  protected readonly teamsLoading = this.currentTeamService.loading;

  protected readonly periods = PERIODS;
  protected readonly period = signal<Period>('7d');
  protected readonly filterUserId = signal('');
  protected readonly filterTaskId = signal('');

  protected readonly formatDuration = formatDuration;

  private readonly teamEntries = computed(() => {
    const teamId = this.team()?.id;
    return teamId ? this.timeTracking.entriesForTeam(teamId) : [];
  });

  protected readonly availableUsers = computed(() => {
    const map = new Map<string, string>();
    for (const entry of this.teamEntries()) {
      map.set(entry.userId, entry.userName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly availableTasks = computed(() => {
    const map = new Map<string, string>();
    for (const entry of this.teamEntries()) {
      map.set(entry.taskId, entry.taskTitle);
    }
    return [...map.entries()].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  });

  protected readonly filteredEntries = computed(() => {
    const cutoff = this.periodCutoffMs();
    const userId = this.filterUserId();
    const taskId = this.filterTaskId();
    return this.teamEntries().filter(
      (e) =>
        new Date(e.startedAt).getTime() >= cutoff &&
        (!userId || e.userId === userId) &&
        (!taskId || e.taskId === taskId),
    );
  });

  protected readonly grandTotalSeconds = computed(() =>
    this.filteredEntries().reduce((sum, e) => sum + this.effectiveSeconds(e), 0),
  );

  protected readonly activeCount = computed(() => this.filteredEntries().filter((e) => e.endedAt === null).length);

  private readonly entrySelection = new RowSelection();
  protected readonly selectedCount = this.entrySelection.count;
  protected readonly allSelected = computed(() => this.entrySelection.allSelected(this.filteredEntries().map((e) => e.id)));

  private readonly userSelection = new RowSelection();
  protected readonly selectedUserCount = this.userSelection.count;
  protected readonly allUsersSelected = computed(() => this.userSelection.allSelected(this.byUser().map((g) => g.key)));

  private readonly taskSelection = new RowSelection();
  protected readonly selectedTaskCount = this.taskSelection.count;
  protected readonly allTasksSelected = computed(() => this.taskSelection.allSelected(this.byTask().map((g) => g.key)));

  protected readonly byUser = computed<GroupTotal[]>(() => this.groupBy(this.filteredEntries(), (e) => e.userId, (e) => e.userName));

  protected readonly byTask = computed<GroupTotal[]>(() =>
    this.groupBy(this.filteredEntries(), (e) => e.taskId, (e) => e.taskTitle),
  );

  protected effectiveSeconds(entry: TimeEntry): number {
    if (entry.durationSeconds !== null) {
      return entry.durationSeconds;
    }
    return Math.max(0, (this.ticker.now() - new Date(entry.startedAt).getTime()) / 1000);
  }

  protected onPeriodChange(value: string): void {
    this.period.set(value as Period);
    this.clearAllSelections();
  }

  protected setFilterUserId(value: string): void {
    this.filterUserId.set(value);
    this.clearAllSelections();
  }

  protected setFilterTaskId(value: string): void {
    this.filterTaskId.set(value);
    this.clearAllSelections();
  }

  private clearAllSelections(): void {
    this.entrySelection.clear();
    this.userSelection.clear();
    this.taskSelection.clear();
  }

  protected toggleSelectAll(checked: boolean): void {
    this.entrySelection.toggleAll(checked, this.filteredEntries().map((e) => e.id));
  }

  protected toggleSelectOne(id: string, checked: boolean): void {
    this.entrySelection.toggleOne(id, checked);
  }

  protected isSelected(id: string): boolean {
    return this.entrySelection.isSelected(id);
  }

  protected toggleSelectAllUsers(checked: boolean): void {
    this.userSelection.toggleAll(checked, this.byUser().map((g) => g.key));
  }

  protected toggleSelectOneUser(key: string, checked: boolean): void {
    this.userSelection.toggleOne(key, checked);
  }

  protected isUserSelected(key: string): boolean {
    return this.userSelection.isSelected(key);
  }

  protected toggleSelectAllTasks(checked: boolean): void {
    this.taskSelection.toggleAll(checked, this.byTask().map((g) => g.key));
  }

  protected toggleSelectOneTask(key: string, checked: boolean): void {
    this.taskSelection.toggleOne(key, checked);
  }

  protected isTaskSelected(key: string): boolean {
    return this.taskSelection.isSelected(key);
  }

  protected exportAll(): void {
    this.exportEntries(this.filteredEntries(), 'suivi-du-temps');
  }

  protected exportSelected(): void {
    if (this.selectedCount() === 0) {
      this.toast.info('Sélectionnez au moins une session à exporter.');
      return;
    }
    const entries = this.filteredEntries().filter((e) => this.entrySelection.isSelected(e.id));
    this.exportEntries(entries, 'suivi-du-temps-selection');
  }

  private exportEntries(entries: TimeEntry[], filenamePrefix: string): void {
    const rows: ExcelCell[][] = entries.map((e) => [
      { type: 'String', value: e.userName },
      { type: 'String', value: e.taskTitle },
      { type: 'String', value: new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(e.startedAt)) },
      { type: 'String', value: e.endedAt ? 'Terminé' : 'En cours' },
      { type: 'Number', value: Math.round(this.effectiveSeconds(e) / 60) },
    ]);

    const xml = buildExcelWorkbook(
      'Suivi du temps',
      [
        { header: 'Personne', width: 160 },
        { header: 'Tâche', width: 260 },
        { header: 'Début', width: 130 },
        { header: 'Statut', width: 90 },
        { header: 'Durée (min)', width: 100 },
      ],
      rows,
    );

    const today = new Date().toISOString().slice(0, 10);
    downloadExcelWorkbook(xml, `${filenamePrefix}-${today}.xls`);
    this.toast.success(`${entries.length} session(s) exportée(s).`);
  }

  protected exportAllByUser(): void {
    this.exportGroupTotals(this.byUser(), 'Personne', 'suivi-du-temps-par-personne');
  }

  protected exportSelectedByUser(): void {
    if (this.selectedUserCount() === 0) {
      this.toast.info('Sélectionnez au moins une personne à exporter.');
      return;
    }
    const groups = this.byUser().filter((g) => this.userSelection.isSelected(g.key));
    this.exportGroupTotals(groups, 'Personne', 'suivi-du-temps-par-personne-selection');
  }

  protected exportAllByTask(): void {
    this.exportGroupTotals(this.byTask(), 'Tâche', 'suivi-du-temps-par-tache');
  }

  protected exportSelectedByTask(): void {
    if (this.selectedTaskCount() === 0) {
      this.toast.info('Sélectionnez au moins une tâche à exporter.');
      return;
    }
    const groups = this.byTask().filter((g) => this.taskSelection.isSelected(g.key));
    this.exportGroupTotals(groups, 'Tâche', 'suivi-du-temps-par-tache-selection');
  }

  private exportGroupTotals(groups: GroupTotal[], labelHeader: string, filenamePrefix: string): void {
    if (groups.length === 0) {
      this.toast.info('Aucune donnée à exporter sur cette période.');
      return;
    }

    const rows: ExcelCell[][] = groups.map((g) => [
      { type: 'String', value: g.label },
      { type: 'Number', value: g.entryCount },
      { type: 'Number', value: Math.round(g.totalSeconds / 60) },
    ]);

    const xml = buildExcelWorkbook(
      filenamePrefix.includes('personne') ? 'Par personne' : 'Par tâche',
      [
        { header: labelHeader, width: 220 },
        { header: 'Sessions', width: 90 },
        { header: 'Durée totale (min)', width: 130 },
      ],
      rows,
    );

    const today = new Date().toISOString().slice(0, 10);
    downloadExcelWorkbook(xml, `${filenamePrefix}-${today}.xls`);
    this.toast.success(`${groups.length} ligne(s) exportée(s).`);
  }

  private periodCutoffMs(): number {
    const now = Date.now();
    switch (this.period()) {
      case 'today': {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        return start.getTime();
      }
      case '7d':
        return now - 7 * 86_400_000;
      case '30d':
        return now - 30 * 86_400_000;
      default:
        return 0;
    }
  }

  private groupBy(
    entries: TimeEntry[],
    keyFn: (e: TimeEntry) => string,
    labelFn: (e: TimeEntry) => string,
  ): GroupTotal[] {
    const map = new Map<string, GroupTotal>();
    for (const entry of entries) {
      const key = keyFn(entry);
      const existing = map.get(key);
      const seconds = this.effectiveSeconds(entry);
      if (existing) {
        existing.totalSeconds += seconds;
        existing.entryCount += 1;
      } else {
        map.set(key, { key, label: labelFn(entry), totalSeconds: seconds, entryCount: 1 });
      }
    }
    return [...map.values()].sort((a, b) => b.totalSeconds - a.totalSeconds);
  }
}
