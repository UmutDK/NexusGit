import { Injectable, signal } from '@angular/core';

export interface DialogRequest {
  kind: 'confirm' | 'alert';
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  resolve: (confirmed: boolean) => void;
}

export interface ConfirmOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface AlertOptions {
  okLabel?: string;
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly request = signal<DialogRequest | null>(null);

  confirm(message: string, options?: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.request.set({
        kind: 'confirm',
        message,
        confirmLabel: options?.confirmLabel ?? 'Confirmer',
        cancelLabel: options?.cancelLabel ?? 'Annuler',
        danger: options?.danger ?? false,
        resolve,
      });
    });
  }

  alert(message: string, options?: AlertOptions): Promise<void> {
    return new Promise((resolve) => {
      this.request.set({
        kind: 'alert',
        message,
        confirmLabel: options?.okLabel ?? "J'ai compris",
        cancelLabel: '',
        danger: false,
        resolve: () => resolve(),
      });
    });
  }

  respond(confirmed: boolean): void {
    const req = this.request();
    if (!req) {
      return;
    }
    this.request.set(null);
    req.resolve(confirmed);
  }
}
