import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideFlame, LucideStar, LucideTriangleAlert, LucideZap } from '@lucide/angular';
import type { TaskPriority } from '../../../core/models';

interface PriorityConfig {
  label: string;
  modifier: string;
}

const PRIORITY_CONFIG: Record<TaskPriority, PriorityConfig> = {
  faible: { label: 'Faible', modifier: 'faible' },
  moyenne: { label: 'Moyenne', modifier: 'moyenne' },
  haute: { label: 'Haute', modifier: 'haute' },
  critique: { label: 'Critique', modifier: 'critique' },
};

@Component({
  selector: 'app-priority-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideStar, LucideZap, LucideTriangleAlert, LucideFlame],
  styleUrl: './priority-badge.css',
  template: `
    <span class="priority-badge" [class]="'priority-badge--' + config().modifier">
      @switch (priority()) {
        @case ('faible') {
          <svg lucideStar></svg>
        }
        @case ('moyenne') {
          <svg lucideZap></svg>
        }
        @case ('haute') {
          <svg lucideTriangleAlert></svg>
        }
        @case ('critique') {
          <svg lucideFlame></svg>
        }
      }
      {{ config().label }}
    </span>
  `,
})
export class PriorityBadge {
  readonly priority = input.required<TaskPriority>();
  protected readonly config = computed(() => PRIORITY_CONFIG[this.priority()]);
}
