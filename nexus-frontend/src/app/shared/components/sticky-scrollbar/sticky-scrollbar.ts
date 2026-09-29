import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

/** Événements qui désignent l'élément que l'utilisateur est en train de faire défiler. */
const DRIVER_EVENTS = ['pointerenter', 'pointerdown', 'wheel', 'touchstart'] as const;

/**
 * Barre de défilement horizontale collée en bas de l'écran pour un élément large (le Kanban) :
 * elle reste visible pendant qu'on fait défiler la page, sans devoir descendre jusqu'en bas
 * de l'élément. Elle est synchronisée avec `target` et masquée quand il n'y a rien à faire
 * défiler. La barre native de `target` doit être masquée (voir .kanban).
 *
 * Pour que le défilement reste fluide, surtout au pavé tactile :
 * - seul l'élément manipulé (sous la souris / le doigt) commande l'autre ; une synchronisation
 *   dans les deux sens ferait se renvoyer la position, ce qui interrompt le défilement fluide
 *   (mouvements perdus, saccades), en particulier avec un zoom Windows à 125-150 % ;
 * - les écouteurs sont passifs et hors de la zone Angular : un défilement émet des dizaines
 *   d'événements par seconde, qui relanceraient sinon la détection de changements de tout
 *   le tableau à chaque fois.
 */
@Component({
  selector: 'app-sticky-scrollbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #track class="track">
      <div class="spacer" [style.width.px]="contentWidth()"></div>
    </div>
  `,
  styleUrl: './sticky-scrollbar.css',
  host: { '[class.is-hidden]': '!overflowing()' },
})
export class StickyScrollbar {
  readonly target = input.required<HTMLElement>();

  private readonly zone = inject(NgZone);
  private readonly track = viewChild.required<ElementRef<HTMLDivElement>>('track');

  protected readonly contentWidth = signal(0);
  protected readonly overflowing = signal(false);

  constructor() {
    effect((onCleanup) => {
      const el = this.target();
      const track = this.track().nativeElement;
      let driver: 'target' | 'track' = 'target';
      let frame = 0;

      const measure = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          this.contentWidth.set(el.scrollWidth);
          this.overflowing.set(el.scrollWidth > el.clientWidth + 1);
        });
      };
      const onTargetScroll = () => {
        if (driver === 'target') {
          track.scrollLeft = el.scrollLeft;
        }
      };
      const onTrackScroll = () => {
        if (driver === 'track') {
          el.scrollLeft = track.scrollLeft;
        }
      };
      // La barre ne commande que pendant qu'on s'en sert : dès que la souris la quitte (hors glissement
      // de son curseur), le Kanban reprend la main, pour que la barre suive tout autre défilement.
      let draggingTrack = false;
      const driveFromTarget = () => (driver = 'target');
      const driveFromTrack = () => (driver = 'track');
      const onTrackPointerDown = () => (draggingTrack = true);
      const onPointerUp = () => {
        draggingTrack = false;
        if (!track.matches(':hover')) {
          driver = 'target';
        }
      };
      const onTrackPointerLeave = () => {
        if (!draggingTrack) {
          driver = 'target';
        }
      };

      // Ajout/suppression de colonnes, formulaire "Ajouter un statut", taille de la fenêtre…
      const resizeObserver = new ResizeObserver(measure);
      const mutationObserver = new MutationObserver(measure);

      this.zone.runOutsideAngular(() => {
        resizeObserver.observe(el);
        mutationObserver.observe(el, { childList: true, subtree: true });
        el.addEventListener('scroll', onTargetScroll, { passive: true });
        track.addEventListener('scroll', onTrackScroll, { passive: true });
        track.addEventListener('pointerdown', onTrackPointerDown, { passive: true });
        track.addEventListener('pointerleave', onTrackPointerLeave, { passive: true });
        window.addEventListener('pointerup', onPointerUp, { passive: true });
        for (const type of DRIVER_EVENTS) {
          el.addEventListener(type, driveFromTarget, { passive: true });
          track.addEventListener(type, driveFromTrack, { passive: true });
        }
        measure();
      });

      onCleanup(() => {
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        mutationObserver.disconnect();
        el.removeEventListener('scroll', onTargetScroll);
        track.removeEventListener('scroll', onTrackScroll);
        track.removeEventListener('pointerdown', onTrackPointerDown);
        track.removeEventListener('pointerleave', onTrackPointerLeave);
        window.removeEventListener('pointerup', onPointerUp);
        for (const type of DRIVER_EVENTS) {
          el.removeEventListener(type, driveFromTarget);
          track.removeEventListener(type, driveFromTrack);
        }
      });
    });
  }
}
