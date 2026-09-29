import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { TaskNote } from '../models';

/** Note libre d'une tâche (une seule par tâche, comme la description), adossée au backend. */
@Injectable({ providedIn: 'root' })
export class TaskNoteService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  constructor() {
    try {
      localStorage.removeItem('nexus_task_notes_mock_v1');
    } catch {
      // Stockage indisponible : rien à nettoyer.
    }
  }

  get(taskId: string): Observable<TaskNote> {
    return this.http.get<TaskNote>(`${this.apiUrl}/tasks/${taskId}/note`);
  }

  save(taskId: string, text: string): Observable<TaskNote> {
    return this.http.put<TaskNote>(`${this.apiUrl}/tasks/${taskId}/note`, { text });
  }
}
