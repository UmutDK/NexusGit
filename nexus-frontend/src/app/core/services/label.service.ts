import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateLabelRequest, Label, UpdateLabelRequest } from '../models';

@Injectable({ providedIn: 'root' })
export class LabelService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listForTeam(teamId: string): Observable<Label[]> {
    return this.http.get<Label[]>(`${this.apiUrl}/teams/${teamId}/labels`);
  }

  create(teamId: string, request: CreateLabelRequest): Observable<Label> {
    return this.http.post<Label>(`${this.apiUrl}/teams/${teamId}/labels`, request);
  }

  update(labelId: string, request: UpdateLabelRequest): Observable<Label> {
    return this.http.patch<Label>(`${this.apiUrl}/labels/${labelId}`, request);
  }

  delete(labelId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/labels/${labelId}`);
  }
}
