import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { getAvatarColor, getInitials } from '../../utils/avatar.util';

export type AvatarSize = 'sm' | 'md';

@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './avatar.css',
  template: `
    <span class="avatar" [class]="'avatar--' + size() + ' avatar--' + color()">
      {{ initials() }}
    </span>
  `,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly size = input<AvatarSize>('md');

  protected readonly initials = computed(() => getInitials(this.name()));
  protected readonly color = computed(() => getAvatarColor(this.name()));
}
