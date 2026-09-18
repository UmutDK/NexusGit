import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Label } from '../../../core/models';

@Component({
  selector: 'app-label-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './label-pill.css',
  template: `
    <span
      class="label-pill"
      [style.color]="label().color"
      [style.borderColor]="borderColor()"
      [style.backgroundColor]="backgroundColor()"
    >
      {{ label().name }}
    </span>
  `,
})
export class LabelPill {
  readonly label = input.required<Label>();

  protected readonly borderColor = computed(() => `${this.label().color}66`);
  protected readonly backgroundColor = computed(() => `${this.label().color}1a`);
}
