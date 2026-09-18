import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import {
  LucideBell,
  LucideBellDot,
  LucideBellRing,
  LucideCheckCheck,
  LucideClock,
  LucideMessageSquare,
  LucideRefreshCw,
  LucideUserPlus,
} from '@lucide/angular';
import { NotificationService, ToastService } from '../../../core/services';
import type { Notification, NotificationType } from '../../../core/models';

@Component({
  selector: 'app-notifications-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideBell,
    LucideBellDot,
    LucideBellRing,
    LucideCheckCheck,
    LucideClock,
    LucideMessageSquare,
    LucideRefreshCw,
    LucideUserPlus,
  ],
  templateUrl: './notifications-panel.html',
  styleUrl: './notifications-panel.css',
})
export class NotificationsPanel implements OnInit {
  private readonly notificationService = inject(NotificationService);
  private readonly toast = inject(ToastService);

  protected readonly open = signal(false);
  protected readonly notifications = signal<Notification[]>([]);
  protected readonly hasUnread = computed(() => this.notifications().some((n) => !n.isRead));

  ngOnInit(): void {
    this.refresh();
  }

  private refresh(): void {
    this.notificationService
      .list()
      .pipe(catchError(() => of([])))
      .subscribe((notifications) => this.notifications.set(notifications));
  }

  toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) {
      this.refresh();
    }
  }

  close(): void {
    this.open.set(false);
  }

  markAsRead(notification: Notification): void {
    if (notification.isRead) {
      return;
    }
    this.notificationService.markAsRead(notification.id).subscribe({
      next: () => {
        this.notifications.update((list) =>
          list.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
        );
      },
      error: () => this.toast.error('Impossible de marquer cette notification comme lue.'),
    });
  }

  markAllAsRead(): void {
    const unread = this.notifications().filter((n) => !n.isRead);
    for (const notification of unread) {
      this.markAsRead(notification);
    }
  }

  protected iconFor(type: NotificationType): string {
    switch (type) {
      case 'due_date_soon':
        return 'clock';
      case 'status_changed':
        return 'refresh';
      case 'comment_added':
        return 'message';
      case 'assigned':
        return 'user-plus';
      case 'manual_reminder':
        return 'bell-ring';
    }
  }
}
