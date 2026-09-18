import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TeamService } from './team.service';
import { environment } from '../../../environments/environment';
import type { Team } from '../models';

describe('TeamService', () => {
  let service: TeamService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/teams`;

  const team: Team = {
    id: 't1',
    name: 'Équipe Produit',
    dueSoonDays: 3,
    memberCount: 3,
    myRole: 'coordinator',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TeamService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('list() GETs the teams collection', () => {
    service.list().subscribe((teams) => {
      expect(teams).toEqual([team]);
    });
    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('GET');
    req.flush([team]);
  });

  it('create() POSTs a new team request', () => {
    service.create({ name: 'Équipe Marketing' }).subscribe((created) => {
      expect(created).toEqual(team);
    });
    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Équipe Marketing' });
    req.flush(team);
  });

  it('removeMember() DELETEs the member sub-resource', () => {
    service.removeMember('t1', 'u2').subscribe();
    const req = httpMock.expectOne(`${baseUrl}/t1/members/u2`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('revokeInvitation() PATCHes status to revoked on the specific invitation', () => {
    service.revokeInvitation('t1', 'inv1').subscribe();
    const req = httpMock.expectOne(`${baseUrl}/t1/invitations/inv1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'revoked' });
    req.flush({});
  });

  it('revokeInvitation() does not hit the collection-level invitations endpoint', () => {
    service.revokeInvitation('t1', 'inv1').subscribe();
    httpMock.expectOne(`${baseUrl}/t1/invitations/inv1`).flush({});
    const stray = httpMock.match(`${baseUrl}/t1/invitations`);
    expect(stray.length).toBe(0);
  });

  it('acceptInvitation() POSTs to the invitations accept endpoint, not /teams', () => {
    service.acceptInvitation('tok-123').subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/invitations/tok-123/accept`);
    expect(req.request.method).toBe('POST');
    req.flush(team);
  });
});
