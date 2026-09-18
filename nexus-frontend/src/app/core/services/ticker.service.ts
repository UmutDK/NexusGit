import { Injectable, signal } from '@angular/core';

/**
 * Single shared 1s clock so every running-timer display (task cards, modal,
 * recap page) ticks off one interval instead of each spinning up its own.
 */
@Injectable({ providedIn: 'root' })
export class TickerService {
  readonly now = signal(Date.now());

  constructor() {
    setInterval(() => this.now.set(Date.now()), 1000);
  }
}
