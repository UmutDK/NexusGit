import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateTeamRequest,
  Invitation,
  InviteMemberRequest,
  Team,
  TeamMember,
  TeamRole,
  UpdateTeamRequest,
} from '../models';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teams`;

  list(): Observable<Team[]> {
    return this.http.get<Team[]>(this.baseUrl);
  }

  get(teamId: string): Observable<Team> {
    return this.http.get<Team>(`${this.baseUrl}/${teamId}`);
  }

  create(request: CreateTeamRequest): Observable<Team> {
    return this.http.post<Team>(this.baseUrl, request);
  }

  update(teamId: string, request: UpdateTeamRequest): Observable<Team> {
    return this.http.patch<Team>(`${this.baseUrl}/${teamId}`, request);
  }

  delete(teamId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${teamId}`);
  }

  listMembers(teamId: string): Observable<TeamMember[]> {
    return this.http.get<TeamMember[]>(`${this.baseUrl}/${teamId}/members`);
  }

  updateMemberRole(teamId: string, userId: string, role: TeamRole): Observable<TeamMember> {
    return this.http.patch<TeamMember>(`${this.baseUrl}/${teamId}/members/${userId}`, { role });
  }

  removeMember(teamId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${teamId}/members/${userId}`);
  }

  listInvitations(teamId: string): Observable<Invitation[]> {
    return this.http.get<Invitation[]>(`${this.baseUrl}/${teamId}/invitations`);
  }

  invite(teamId: string, request: InviteMemberRequest): Observable<Invitation> {
    return this.http.post<Invitation>(`${this.baseUrl}/${teamId}/invitations`, request);
  }

  revokeInvitation(teamId: string, invitationId: string): Observable<Invitation> {
    return this.http.patch<Invitation>(`${this.baseUrl}/${teamId}/invitations/${invitationId}`, {
      status: 'revoked',
    });
  }

  acceptInvitation(token: string): Observable<Team> {
    return this.http.post<Team>(`${environment.apiUrl}/invitations/${token}/accept`, {});
  }
}
