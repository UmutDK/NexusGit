import { User } from './user.model';

export type ActivityAction =
  | 'task_created'
  | 'status_changed'
  | 'priority_changed'
  | 'assigned'
  | 'unassigned'
  | 'label_added'
  | 'label_removed'
  | 'comment_added'
  | 'member_joined'
  | 'member_role_changed';

export interface ActivityLogEntry {
  id: string;
  actionType: ActivityAction;
  user: User;
  metadata: Record<string, unknown>;
  createdAt: string;
}
