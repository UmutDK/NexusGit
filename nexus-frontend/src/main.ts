import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';
import { TOKEN_KEY } from './app/core/services';

// Auto-connexion en dev tant qu'il n'y a pas d'écran de login réel : à retirer une fois l'auth construite.
if (!environment.production && !localStorage.getItem(TOKEN_KEY)) {
  localStorage.setItem(TOKEN_KEY, 'dev-token');
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
