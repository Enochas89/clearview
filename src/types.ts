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
  invitedBy?: string | null;
  invitedAt?: string | null;
  acceptedAt?: string | null;
  fullName?: string | null;
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

export type ChangeOrderStatus =
  | "pending"
  | "approved"
  | "approved_with_conditions"
  | "denied"
  | "needs_info";

export type ChangeOrderLineItem = {
  id: string;
  title: string;
  description: string;
  impactDays: number;
  cost: number;
};

export type ChangeOrderRecipientStatus =
  | "pending"
  | "approved"
  | "approved_with_conditions"
  | "denied"
  | "needs_info";

export type ChangeOrderRecipient = {
  id: string;
  changeOrderId: string;
  email: string;
  name?: string | null;
  status: ChangeOrderRecipientStatus;
  conditionNote?: string | null;
  respondedAt?: string | null;
};

export type ChangeOrder = {
  id: string;
  projectId: string;
  subject: string;
  description: string;
  recipientName: string;
  recipientEmail: string;
  status: ChangeOrderStatus;
  sentAt: string;
  updatedAt: string;
  responseAt?: string | null;
  responseMessage?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  respondedBy?: string | null;
  respondedByName?: string | null;
  lineItems: ChangeOrderLineItem[];
  recipients: ChangeOrderRecipient[];
};

export type InviteMemberResult = {
  member: ProjectMember;
  emailWarning?: string | null;
};
