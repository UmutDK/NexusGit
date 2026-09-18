import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Notification } from '../models';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(unreadOnly = false): Observable<Notification[]> {
    const params = new HttpParams().set('unreadOnly', unreadOnly);
    return this.http.get<Notification[]>(`${this.apiUrl}/notifications`, { params });
  }

  markAsRead(notificationId: string): Observable<Notification> {
    return this.http.patch<Notification>(`${this.apiUrl}/notifications/${notificationId}/read`, {});
  }
}
