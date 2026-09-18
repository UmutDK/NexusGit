import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateStatusRequest, Status, UpdateStatusRequest } from '../models';

@Injectable({ providedIn: 'root' })
export class StatusService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listForBoard(boardId: string): Observable<Status[]> {
    return this.http.get<Status[]>(`${this.apiUrl}/boards/${boardId}/statuses`);
  }

  create(boardId: string, request: CreateStatusRequest): Observable<Status> {
    return this.http.post<Status>(`${this.apiUrl}/boards/${boardId}/statuses`, request);
  }

  update(statusId: string, request: UpdateStatusRequest): Observable<Status> {
    return this.http.patch<Status>(`${this.apiUrl}/statuses/${statusId}`, request);
  }

  delete(statusId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/statuses/${statusId}`);
  }
}
