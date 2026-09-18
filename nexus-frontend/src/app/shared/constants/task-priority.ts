import type { TaskPriority } from '../../core/models';

export interface TaskPriorityOption {
  value: TaskPriority;
  label: string;
}

export const TASK_PRIORITIES: TaskPriorityOption[] = [
  { value: 'faible', label: 'Faible' },
  { value: 'moyenne', label: 'Moyenne' },
  { value: 'haute', label: 'Haute' },
  { value: 'critique', label: 'Critique' },
];
