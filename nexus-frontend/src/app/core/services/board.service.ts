import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Board, CreateBoardRequest, UpdateBoardRequest } from '../models';

@Injectable({ providedIn: 'root' })
export class BoardService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listForTeam(teamId: string): Observable<Board[]> {
    return this.http.get<Board[]>(`${this.apiUrl}/teams/${teamId}/boards`);
  }

  get(boardId: string): Observable<Board> {
    return this.http.get<Board>(`${this.apiUrl}/boards/${boardId}`);
  }

  create(teamId: string, request: CreateBoardRequest): Observable<Board> {
    return this.http.post<Board>(`${this.apiUrl}/teams/${teamId}/boards`, request);
  }

  update(boardId: string, request: UpdateBoardRequest): Observable<Board> {
    return this.http.patch<Board>(`${this.apiUrl}/boards/${boardId}`, request);
  }

  delete(boardId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/boards/${boardId}`);
  }
}
