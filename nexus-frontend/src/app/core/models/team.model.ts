import { User } from './user.model';

export type TeamRole = 'coordinator' | 'member';

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface Team {
  id: string;
  name: string;
  dueSoonDays: number;
  memberCount: number;
  myRole: TeamRole;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeamRequest {
  name: string;
}

export interface UpdateTeamRequest {
  name?: string;
  dueSoonDays?: number;
}

export interface TeamMember {
  user: User;
  role: TeamRole;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  invitedBy: User;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
}

export interface InviteMemberRequest {
  email: string;
}
