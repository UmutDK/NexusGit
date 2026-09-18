import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'invitations/:token',
    loadComponent: () =>
      import('./features/invitations/accept-invitation').then((m) => m.AcceptInvitation),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'tasks',
        loadComponent: () => import('./features/boards/board').then((m) => m.BoardPage),
      },
      {
        path: 'teams',
        loadComponent: () => import('./features/teams/teams').then((m) => m.Teams),
      },
      {
        path: 'time-tracking',
        loadComponent: () => import('./features/time-tracking/time-tracking').then((m) => m.TimeTracking),
      },
      {
        path: 'calendar',
        loadComponent: () => import('./features/calendar/calendar').then((m) => m.CalendarPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
