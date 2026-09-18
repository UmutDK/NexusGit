import { TestBed } from '@angular/core/testing';
import { NameColorForm, type NameColorFormValue } from './name-color-form';

describe('NameColorForm', () => {
  function createComponent() {
    const fixture = TestBed.createComponent(NameColorForm);
    fixture.detectChanges();
    return fixture;
  }

  function setNameInput(fixture: ReturnType<typeof createComponent>, value: string) {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="text"]');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function clickSubmit(fixture: ReturnType<typeof createComponent>) {
    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const submitBtn = buttons.find((b) => b.textContent?.trim() === fixture.componentInstance.submitLabel());
    submitBtn!.click();
    fixture.detectChanges();
  }

  it('pre-fills the name/color inputs from initialName/initialColor', () => {
    const fixture = TestBed.createComponent(NameColorForm);
    fixture.componentRef.setInput('initialName', 'Design');
    fixture.componentRef.setInput('initialColor', '#3b82f6');
    fixture.detectChanges();

    const nameInput: HTMLInputElement = fixture.nativeElement.querySelector('input[type="text"]');
    const colorInput: HTMLInputElement = fixture.nativeElement.querySelector('input[type="color"]');
    expect(nameInput.value).toBe('Design');
    expect(colorInput.value).toBe('#3b82f6');
  });

  it('emits submitted with the trimmed name and chosen color on submit', () => {
    const fixture = createComponent();
    let emitted: NameColorFormValue | undefined;
    fixture.componentInstance.submitted.subscribe((v) => (emitted = v));

    setNameInput(fixture, '  Urgent  ');
    clickSubmit(fixture);

    expect(emitted).toEqual({ name: 'Urgent', color: '#3b82f6' });
  });

  it('does not emit submitted when the name is empty or only whitespace', () => {
    const fixture = createComponent();
    let emitted: NameColorFormValue | undefined;
    fixture.componentInstance.submitted.subscribe((v) => (emitted = v));

    setNameInput(fixture, '   ');
    clickSubmit(fixture);

    expect(emitted).toBeUndefined();
  });

  it('emits cancelled when the Annuler button is clicked', () => {
    const fixture = createComponent();
    let cancelled = false;
    fixture.componentInstance.cancelled.subscribe(() => (cancelled = true));

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const cancelBtn = buttons.find((b) => b.textContent?.trim() === 'Annuler');
    cancelBtn!.click();

    expect(cancelled).toBe(true);
  });

  it('hides the color input when showColor is false', () => {
    const fixture = TestBed.createComponent(NameColorForm);
    fixture.componentRef.setInput('showColor', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="color"]')).toBeNull();
  });

  it('shows the error message when the error input is set', () => {
    const fixture = TestBed.createComponent(NameColorForm);
    fixture.componentRef.setInput('error', 'Une étiquette avec ce nom existe déjà.');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Une étiquette avec ce nom existe déjà.',
    );
  });
});
