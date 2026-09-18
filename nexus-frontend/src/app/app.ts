import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainer } from './shared/components/toast-container/toast-container';
import { DialogContainer } from './shared/components/dialog-container/dialog-container';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainer, DialogContainer],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('nexus-frontend');
}
