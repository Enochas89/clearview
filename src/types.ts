export type Project = {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  startDate: string;
  dueDate: string;
  referenceId: string;
  cost: string;
  address: string;
  projectManager: string;
  userId: string;
};

export type TaskStatus = "todo" | "in-progress" | "done";

export type TaskMetadata = {
  baselineStartDate?: string;
  baselineDueDate?: string;
  actualStartDate?: string;
  actualDueDate?: string;
  percentComplete?: number;
  assignee?: string;
  isMilestone?: boolean;
  notes?: string;
};

export type Task = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  startDate: string;
  dueDate: string;
  status: TaskStatus;
  dependencies: string[];
} & TaskMetadata;

export type TaskDraft = {
  projectId: string;
  name: string;
  description: string;
  startDate: string;
  dueDate: string;
  status: TaskStatus;
  dependencies: string[];
} & TaskMetadata;

export type DayFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  addedAt: string;
  url: string;
};

export type DayEntry = {
  date: string;
  files: DayFile[];
};