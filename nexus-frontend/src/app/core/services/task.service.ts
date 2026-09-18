import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AssigneesUpdateRequest,
  CreateTaskRequest,
  LabelsUpdateRequest,
  Notification,
  RemindRequest,
  Task,
  UpdateTaskRequest,
} from '../models';

export interface TaskListFilters {
  statusId?: string;
  assigneeId?: string;
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listForBoard(boardId: string, filters: TaskListFilters = {}): Observable<Task[]> {
    let params = new HttpParams();
    if (filters.statusId) {
      params = params.set('statusId', filters.statusId);
    }
    if (filters.assigneeId) {
      params = params.set('assigneeId', filters.assigneeId);
    }
    return this.http.get<Task[]>(`${this.apiUrl}/boards/${boardId}/tasks`, { params });
  }

  get(taskId: string): Observable<Task> {
    return this.http.get<Task>(`${this.apiUrl}/tasks/${taskId}`);
  }

  create(boardId: string, request: CreateTaskRequest): Observable<Task> {
    return this.http.post<Task>(`${this.apiUrl}/boards/${boardId}/tasks`, request);
  }

  update(taskId: string, request: UpdateTaskRequest): Observable<Task> {
    return this.http.patch<Task>(`${this.apiUrl}/tasks/${taskId}`, request);
  }

  /** Déplacement drag & drop : nouveau statut et/ou nouvelle position dans la colonne. */
  move(taskId: string, statusId: string, position: number): Observable<Task> {
    return this.update(taskId, { statusId, position });
  }

  delete(taskId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/tasks/${taskId}`);
  }

  setAssignees(taskId: string, request: AssigneesUpdateRequest): Observable<Task> {
    return this.http.put<Task>(`${this.apiUrl}/tasks/${taskId}/assignees`, request);
  }

  setLabels(taskId: string, request: LabelsUpdateRequest): Observable<Task> {
    return this.http.put<Task>(`${this.apiUrl}/tasks/${taskId}/labels`, request);
  }

  remind(taskId: string, request: RemindRequest): Observable<Notification> {
    return this.http.post<Notification>(`${this.apiUrl}/tasks/${taskId}/remind`, request);
  }
}
