import { ChangeDetectionStrategy, Component, OnInit, input, output, signal } from '@angular/core';
import { FieldValueDirective } from '../../directives/field-value.directive';

export interface NameColorFormValue {
  name: string;
  color: string;
}

@Component({
  selector: 'app-name-color-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldValueDirective],
  templateUrl: './name-color-form.html',
  styleUrl: './name-color-form.css',
})
export class NameColorForm implements OnInit {
  readonly initialName = input('');
  readonly initialColor = input('#3b82f6');
  readonly showColor = input(true);
  readonly namePlaceholder = input('Nom');
  readonly submitLabel = input('Enregistrer');
  readonly error = input<string | null>(null);
  readonly layout = input<'stack' | 'row'>('stack');

  readonly submitted = output<NameColorFormValue>();
  readonly cancelled = output<void>();

  protected readonly name = signal('');
  protected readonly color = signal('#3b82f6');

  ngOnInit(): void {
    this.name.set(this.initialName());
    this.color.set(this.initialColor());
  }

  protected submit(): void {
    const trimmed = this.name().trim();
    if (!trimmed) {
      return;
    }
    this.submitted.emit({ name: trimmed, color: this.color() });
  }
}
