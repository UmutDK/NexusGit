import { User } from './user.model';

export interface Comment {
  id: string;
  taskId: string;
  author: User;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCommentRequest {
  body: string;
}

export interface UpdateCommentRequest {
  body: string;
}
