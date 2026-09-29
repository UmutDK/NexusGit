import { TeamMember } from './team.model';
import { Task } from './task.model';

export interface DashboardStatusCount {
  name: string;
  color: string;
  isTerminal: boolean;
  count: number;
}

export interface DashboardStats {
  totalTasks: number;
  inProgress: number;
  completed: number;
  toStart: number;
  /** Une entrée par colonne des tableaux de l'équipe (regroupées par nom), dans l'ordre des colonnes. */
  statusBreakdown?: DashboardStatusCount[];
  /** Tâches non terminées assignées à l'utilisateur connecté. */
  myOpenTasks?: number;
  teamMembers: TeamMember[];
  recentTasks: Task[];
}
