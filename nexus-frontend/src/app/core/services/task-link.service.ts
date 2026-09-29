import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ToastService } from './toast.service';
import type { TaskLink } from '../models';

/**
 * Liens attachés aux tâches, adossés au backend. Le backend normalise l'URL
 * (https:// par défaut) et utilise l'URL comme nom si aucun n'est donné.
 */
@Injectable({ providedIn: 'root' })
export class TaskLinkService {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly apiUrl = environment.apiUrl;

  readonly links = signal<TaskLink[]>([]);

  constructor() {
    try {
      localStorage.removeItem('nexus_task_links_mock_v1');
    } catch {
      // Stockage indisponible : rien à nettoyer.
    }
  }

  linksForTask(taskId: string): TaskLink[] {
    return this.links().filter((l) => l.taskId === taskId);
  }

  load(taskId: string): void {
    this.http.get<TaskLink[]>(`${this.apiUrl}/tasks/${taskId}/links`).subscribe({
      next: (list) => this.links.update((all) => [...all.filter((l) => l.taskId !== taskId), ...list]),
      error: () => this.toast.error('Impossible de charger les liens.'),
    });
  }

  addLink(taskId: string, name: string, url: string): void {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      return;
    }
    this.http.post<TaskLink>(`${this.apiUrl}/tasks/${taskId}/links`, { name: name.trim(), url: trimmedUrl }).subscribe({
      next: (link) => this.links.update((all) => [...all, link]),
      error: () => this.toast.error("Impossible d'ajouter ce lien."),
    });
  }

  deleteLink(linkId: string): void {
    this.http.delete<void>(`${this.apiUrl}/links/${linkId}`).subscribe({
      next: () => this.links.update((all) => all.filter((l) => l.id !== linkId)),
      error: () => this.toast.error('Impossible de supprimer ce lien.'),
    });
  }
}
