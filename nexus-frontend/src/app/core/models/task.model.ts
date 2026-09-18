import { User } from './user.model';
import { Label } from './label.model';

export type TaskPriority = 'faible' | 'moyenne' | 'haute' | 'critique';

export interface Task {
  id: string;
  boardId: string;
  statusId: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  position: number;
  createdBy: User;
  assignees: User[];
  labels: Label[];
  commentCount: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskRequest {
  statusId: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
  assigneeIds?: string[];
  labelIds?: string[];
}

export interface UpdateTaskRequest {
  statusId?: string;
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string | null;
  position?: number;
}

export interface AssigneesUpdateRequest {
  userIds: string[];
}

export interface LabelsUpdateRequest {
  labelIds: string[];
}
