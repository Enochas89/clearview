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
  url: string;
  storagePath?: string;
  bucketId?: string;
  noteId?: string | null;
  uploadedBy?: string | null;
  uploadedByName?: string | null;
};

export type DayPost = {
  id: string;
  message: string;
  createdAt: string;
  authorName?: string | null;
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
  authorName?: string | null;
};

export type DayEntry = {
  date: string;
  files: DayFile[];
  posts: DayPost[];
};
