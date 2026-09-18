import { User } from './user.model';

export type NotificationType =
  | 'due_date_soon'
  | 'status_changed'
  | 'comment_added'
  | 'assigned'
  | 'manual_reminder';

export interface Notification {
  id: string;
  type: NotificationType;
  task: { id: string; title: string } | null;
  triggeredBy: User | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface RemindRequest {
  userId: string;
  message?: string;
}
