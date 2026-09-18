import { Directive, ElementRef, HostListener, inject, output } from '@angular/core';

type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Reads `.value`/`.checked` off the host natively (input/change), avoiding
 * `$any($event.target).value` casts scattered across templates.
 */
@Directive({
  selector: '[appFieldValue]',
})
export class FieldValueDirective {
  private readonly elementRef = inject<ElementRef<FieldElement>>(ElementRef);

  readonly fieldInput = output<string>();
  readonly fieldChange = output<string>();
  readonly fieldChecked = output<boolean>();

  @HostListener('input')
  onInput(): void {
    this.fieldInput.emit(this.elementRef.nativeElement.value);
  }

  @HostListener('change')
  onChange(): void {
    this.fieldChange.emit(this.elementRef.nativeElement.value);
    const el = this.elementRef.nativeElement;
    if ('checked' in el) {
      this.fieldChecked.emit((el as HTMLInputElement).checked);
    }
  }
}
