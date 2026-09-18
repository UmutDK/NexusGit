import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CurrentTeamService } from './current-team.service';
import { TeamService } from './team.service';
import type { Team } from '../models';

const STORAGE_KEY = 'nexus_current_team_id';

function makeTeam(id: string, name: string): Team {
  return {
    id,
    name,
    dueSoonDays: 3,
    memberCount: 1,
    myRole: 'coordinator',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('CurrentTeamService', () => {
  let service: CurrentTeamService;
  let teamServiceSpy: jasmine.SpyObj<TeamService>;
  const teamA = makeTeam('t1', 'Équipe Produit');
  const teamB = makeTeam('t2', 'Équipe Marketing');

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    teamServiceSpy = jasmine.createSpyObj('TeamService', ['list']);
    TestBed.configureTestingModule({
      providers: [{ provide: TeamService, useValue: teamServiceSpy }],
    });
    service = TestBed.inject(CurrentTeamService);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('picks the first team as current when nothing is stored', () => {
    teamServiceSpy.list.and.returnValue(of([teamA, teamB]));
    service.ensureLoaded().subscribe();
    expect(service.currentTeamId()).toBe('t1');
    expect(service.currentTeam()).toEqual(teamA);
  });

  it('restores the previously selected team from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 't2');
    teamServiceSpy.list.and.returnValue(of([teamA, teamB]));
    service.ensureLoaded().subscribe();
    expect(service.currentTeamId()).toBe('t2');
  });

  it('ignores a stored id that no longer matches any team', () => {
    localStorage.setItem(STORAGE_KEY, 'does-not-exist');
    teamServiceSpy.list.and.returnValue(of([teamA, teamB]));
    service.ensureLoaded().subscribe();
    expect(service.currentTeamId()).toBe('t1');
  });

  it('only calls TeamService.list() once across repeated ensureLoaded() calls', () => {
    teamServiceSpy.list.and.returnValue(of([teamA]));
    service.ensureLoaded().subscribe();
    service.ensureLoaded().subscribe();
    service.ensureLoaded().subscribe();
    expect(teamServiceSpy.list).toHaveBeenCalledTimes(1);
  });

  it('sets an error and stops loading when the initial fetch fails', () => {
    teamServiceSpy.list.and.returnValue(throwError(() => new Error('network down')));
    service.ensureLoaded().subscribe();
    expect(service.error()).toBe('Impossible de charger vos équipes.');
    expect(service.loading()).toBe(false);
    expect(service.teams()).toEqual([]);
  });

  it('selectTeam() updates currentTeamId and persists the choice', () => {
    teamServiceSpy.list.and.returnValue(of([teamA, teamB]));
    service.ensureLoaded().subscribe();
    service.selectTeam('t2');
    expect(service.currentTeamId()).toBe('t2');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('t2');
  });

  describe('removeTeam()', () => {
    beforeEach(() => {
      teamServiceSpy.list.and.returnValue(of([teamA, teamB]));
      service.ensureLoaded().subscribe();
    });

    it('removing a team that is not current leaves the current selection untouched', () => {
      service.selectTeam('t2');
      service.removeTeam('t1');
      expect(service.teams().map((t) => t.id)).toEqual(['t2']);
      expect(service.currentTeamId()).toBe('t2');
    });

    it('removing the current team falls back to the next remaining team', () => {
      service.selectTeam('t1');
      service.removeTeam('t1');
      expect(service.currentTeamId()).toBe('t2');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('t2');
    });

    it('removing the last remaining team clears the selection and localStorage', () => {
      service.selectTeam('t1');
      service.removeTeam('t2');
      service.removeTeam('t1');
      expect(service.currentTeamId()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  it('reset() clears state and forces the next ensureLoaded() to refetch', () => {
    teamServiceSpy.list.and.returnValue(of([teamA]));
    service.ensureLoaded().subscribe();
    service.selectTeam('t1');

    service.reset();

    expect(service.teams()).toEqual([]);
    expect(service.currentTeamId()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    service.ensureLoaded().subscribe();
    expect(teamServiceSpy.list).toHaveBeenCalledTimes(2);
  });
});
