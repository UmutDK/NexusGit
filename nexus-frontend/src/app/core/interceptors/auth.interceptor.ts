import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService, CurrentTeamService, ToastService } from '../services';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const currentTeamService = inject(CurrentTeamService);
  const toast = inject(ToastService);
  const router = inject(Router);
  const token = authService.getToken();

  const authedReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authedReq).pipe(
    catchError((error: unknown) => {
      // Only force a logout when we believed we were authenticated (a token was
      // sent). A 401 with no token is a normal failed login/register attempt,
      // not an expired session, and should be left to the caller's own error UI.
      if (token && error instanceof HttpErrorResponse && error.status === 401) {
        authService.logout();
        currentTeamService.reset();
        toast.info('Ta session a expiré. Reconnecte-toi.');
        router.navigateByUrl('/login');
      }
      return throwError(() => error);
    }),
  );
};
