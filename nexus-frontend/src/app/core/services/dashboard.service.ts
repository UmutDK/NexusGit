import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DashboardStats } from '../models';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getForTeam(teamId: string): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${this.apiUrl}/teams/${teamId}/dashboard`);
  }
}
