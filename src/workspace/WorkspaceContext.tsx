import { createContext, useContext } from "react";
import { Session } from "@supabase/supabase-js";
import {
  ChangeOrder,
  ChangeOrderLineItem,
  ChangeOrderStatus,
  DayActivity,
  DayEntry,
  DayFile,
  InviteMemberResult,
  MemberRole,
  Project,
  ProjectMember,
  Task,
} from "../types";
import { ProjectFormValues } from "../features/sidebar/projectForm";
import type { WorkspaceTab } from "../app/WorkspaceTabs";

export type TaskReminder = {
  id: string;
  name: string;
  dueDate: string;
  status: Task["status"];
  daysUntilDue: number;
};

export type WorkspaceContextValue = {
  session: Session | null;
  loading: boolean;
  error: string | null;
  projects: Project[];
  tasks: Task[];
  changeOrders: ChangeOrder[];
  projectMembers: ProjectMember[];
  projectDayEntries: Map<string, DayEntry[]>;
  selectedProjectId: string | null;
  setSelectedProjectId: (projectId: string | null) => void;
  navigateTab: (tab: WorkspaceTab) => void;
  recentActivities: DayActivity[];
  upcomingDueTasks: TaskReminder[];
  accountUpdateError: string | null;
  accountUpdateSuccess: string | null;
  isUpdatingAccount: boolean;
  handleCreateProject: (input: ProjectFormValues) => Promise<void>;
  handleUpdateProject: (projectId: string, input: ProjectFormValues) => Promise<void>;
  handleDeleteProject: (projectId: string) => Promise<void>;
  handleInviteMember: (input: {
    projectId: string;
    email: string;
    role: MemberRole;
    name: string;
  }) => Promise<InviteMemberResult | undefined>;
  handleUpdateMemberRole: (memberId: string, role: MemberRole) => Promise<void>;
  handleRemoveMember: (memberId: string) => Promise<void>;
  handleSignOut: () => Promise<void>;
  handleCreateTask: (input: {
    projectId: string;
    name: string;
    description: string;
    startDate: string;
    dueDate: string;
    status: string;
    dependencies: string[];
  }) => Promise<void>;
  handleUpdateTask: (taskId: string, input: Partial<Task>) => Promise<void>;
  handleAddFile: (date: string, file: File, options?: { noteId?: string | null }) => Promise<void>;
  handleRemoveFile: (date: string, fileId: string) => Promise<void>;
  handleCreatePost: (input: { message: string; file?: File | null }) => Promise<void>;
  handleUpdatePost: (postId: string, message: string) => Promise<void>;
  handleDeletePost: (postId: string, attachments: DayFile[]) => Promise<void>;
  handleCreateChangeOrder: (input: {
    subject: string;
    description: string;
    recipientName: string;
    recipientEmail: string;
    lineItems: ChangeOrderLineItem[];
    recipients: Array<{ email: string; name?: string | null }>;
  }) => Promise<void>;
  handleDeleteChangeOrder: (orderId: string) => Promise<void>;
  handleChangeOrderStatus: (
    orderId: string,
    status: ChangeOrderStatus,
    options?: { responseMessage?: string | null },
  ) => Promise<void>;
  handleUpdateAccount: (input: { fullName: string }) => Promise<void>;
  clearAccountFeedback: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export const WorkspaceProvider = ({
  children,
  value,
}: {
  children: React.ReactNode;
  value: WorkspaceContextValue;
}) => <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;

export const useWorkspace = (): WorkspaceContextValue => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
};
