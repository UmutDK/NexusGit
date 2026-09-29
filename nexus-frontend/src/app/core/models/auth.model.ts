import { User } from './user.model';

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UpdateAccountRequest {
  name?: string;
  email?: string;
  /** Exigé par le backend uniquement quand l'email change. */
  currentPassword?: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}
