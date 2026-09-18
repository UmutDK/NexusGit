import { TestBed } from '@angular/core/testing';
import { TaskCard } from './task-card';
import type { Task, User } from '../../../../core/models';

function makeUser(id: string, name: string): User {
  return { id, name, email: `${id}@example.com`, createdAt: '2026-01-01T00:00:00.000Z' };
}

function makeTask(assignees: User[]): Task {
  return {
    id: 'task-1',
    boardId: 'b1',
    statusId: 's1',
    title: 'Refonte du système',
    description: null,
    priority: 'moyenne',
    dueDate: null,
    position: 0,
    createdBy: makeUser('u0', 'Créateur'),
    assignees,
    labels: [],
    commentCount: 0,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('TaskCard', () => {
  function createComponent(assignees: User[]) {
    const fixture = TestBed.createComponent(TaskCard);
    fixture.componentRef.setInput('task', makeTask(assignees));
    fixture.detectChanges();
    return fixture;
  }

  it('shows "Non assigné" when there are no assignees', () => {
    const fixture = createComponent([]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Non assigné');
  });

  it('shows a single assignee by first name with no "+N" badge', () => {
    const fixture = createComponent([makeUser('u1', 'Sophie Martin')]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Sophie');
    expect(el.textContent).not.toContain('+');
  });

  it('renders an avatar per assignee up to the visible max, with no overflow badge at exactly the max', () => {
    const fixture = createComponent([
      makeUser('u1', 'Sophie Martin'),
      makeUser('u2', 'Lucas Bernard'),
      makeUser('u3', 'Inès Dubois'),
    ]);
    const el = fixture.nativeElement as HTMLElement;
    const avatars = el.querySelectorAll('app-avatar');
    expect(avatars.length).toBe(3);
    expect(el.textContent).not.toContain('+1');
  });

  it('caps visible avatars and shows a "+N" badge beyond the max', () => {
    const fixture = createComponent([
      makeUser('u1', 'Sophie Martin'),
      makeUser('u2', 'Lucas Bernard'),
      makeUser('u3', 'Inès Dubois'),
      makeUser('u4', 'Marc Petit'),
    ]);
    const el = fixture.nativeElement as HTMLElement;
    const avatars = el.querySelectorAll('app-avatar');
    expect(avatars.length).toBe(3);
    expect(el.textContent).toContain('+1');
  });

  it('exposes the full assignee name list for the tooltip, comma-joined', () => {
    const fixture = createComponent([makeUser('u1', 'Sophie Martin'), makeUser('u2', 'Lucas Bernard')]);
    const names = (fixture.componentInstance as any).assigneeNames();
    expect(names).toBe('Sophie Martin, Lucas Bernard');
  });
});
