export interface TimeEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  teamId: string;
  userId: string;
  userName: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
}
