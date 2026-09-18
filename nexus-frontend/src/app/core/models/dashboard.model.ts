import { TeamMember } from './team.model';
import { Task } from './task.model';

export interface DashboardStats {
  totalTasks: number;
  inProgress: number;
  completed: number;
  toStart: number;
  teamMembers: TeamMember[];
  recentTasks: Task[];
}
