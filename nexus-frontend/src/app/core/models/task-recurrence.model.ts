export type RecurrenceUnit = 'day' | 'week' | 'month';

export interface TaskRecurrence {
  taskId: string;
  interval: number;
  unit: RecurrenceUnit;
}
