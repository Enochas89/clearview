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

export type MemberRole = "owner" | "editor" | "viewer";
export type MemberStatus = "pending" | "accepted";

export type ProjectMember = {
  id: string;
  projectId: string;
  userId: string | null;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  invitedBy: string;
  invitedAt: string;
  acceptedAt?: string | null;
  fullName?: string | null;
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
  projectId: string;
  date: string;
  bucketId: string;
  path: string;
  name: string;
  size: number;
  type: string;
  addedAt: string;
  url: string;
  uploadedBy?: string;
  expiresAt?: string;
};

export type DayEntry = {
  date: string;
  files: DayFile[];
  notes: DayNote[];
};

export type DayNote = {
  id: string;
  projectId: string;
  date: string;
  text: string;
  userId: string;
  createdAt: string;
};

export type InviteMemberResult = {
  member: ProjectMember;
  emailWarning?: string | null;
};
