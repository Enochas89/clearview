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

export type Task = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  startDate: string;
  dueDate: string;
  status: TaskStatus;
  dependencies: string[];
};

export type DayFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  addedAt: string;
  url: string;\r\n  storagePath\?: string;\r\n  bucketId\?: string;
};

export type DayPost = {
  id: string;
  message: string;
  createdAt: string;
  attachments: DayFile[];
};

export type DayActivity = {
  id: string;
  type: "file" | "post";
  date: string;
  createdAt: string;
  title: string;
  details?: string;
  attachments?: DayFile[];
};

export type DayEntry = {
  date: string;
  files: DayFile[];
  posts: DayPost[];
};
