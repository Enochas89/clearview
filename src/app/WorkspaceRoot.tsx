import { useCallback, useEffect, useMemo } from "react";
import { useParams, Navigate, useNavigate } from "react-router-dom";
import { Session } from "@supabase/supabase-js";
import { WorkspaceProvider, WorkspaceContextValue } from "../workspace/WorkspaceContext";
import { NotificationCenter, useNotifications } from "../workspace/NotificationContext";
import TimelineView from "../features/timeline/TimelineView";
import ChangeOrdersView from "../features/change-orders/ChangeOrdersView";
import AccountView from "../features/account/AccountView";
import GanttView from "../features/gantt/GanttView";
import { useWorkspaceStore } from "../workspace/useWorkspaceStore";
import { WorkspaceLayout } from "./WorkspaceLayout";
import type { WorkspaceTab } from "./WorkspaceTabs";
import AppLoadingScreen from "./AppLoadingScreen";

const ROUTE_TO_TAB: Record<string, WorkspaceTab> = {
  timeline: "timeline",
  gantt: "gantt",
  "change-orders": "changeOrders",
  account: "account",
};

const TAB_COMPONENT: Record<WorkspaceTab, React.ReactNode> = {
  timeline: <TimelineView />,
  gantt: <GanttView />,
  changeOrders: <ChangeOrdersView />,
  account: <AccountView />,
};

export type WorkspaceRootProps = {
  session: Session;
  onSessionChange: (session: Session | null) => void;
};

export const WorkspaceRoot = ({ session, onSessionChange }: WorkspaceRootProps) => {
  const { push } = useNotifications();
  const navigate = useNavigate();
  const params = useParams<{ tab?: string }>();
  const routeTab = params.tab ?? "timeline";
  const activeTab = ROUTE_TO_TAB[routeTab] ?? "timeline";

  useEffect(() => {
    if (!(routeTab in ROUTE_TO_TAB)) {
      navigate("/workspace/timeline", { replace: true });
    }
  }, [routeTab, navigate]);

  const notifyError = useCallback((message: string) => push("error", message), [push]);
  const notifySuccess = useCallback((message: string) => push("success", message), [push]);

  const store = useWorkspaceStore({
    session,
    onSessionChange,
    notifyError,
    notifySuccess,
  });

  const {
    loading,
    fatalError,
    projects,
    tasks,
    changeOrders,
    projectMembers,
    projectDayEntries,
    selectedProjectId,
    setSelectedProjectId,
    recentActivities,
    upcomingDueTasks,
    accountUpdateError,
    accountUpdateSuccess,
    isUpdatingAccount,
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    handleInviteMember,
    handleUpdateMemberRole,
    handleRemoveMember,
    handleSignOut,
    handleCreateTask,
    handleUpdateTask,
    handleAddFile,
    handleRemoveFile,
    handleCreatePost,
    handleUpdatePost,
    handleDeletePost,
    handleCreateChangeOrder,
    handleDeleteChangeOrder,
    handleChangeOrderStatus,
    handleUpdateAccount,
    clearAccountFeedback,
  } = store;

  useEffect(() => {
    if (activeTab === "account") {
      return;
    }
    if (accountUpdateError || accountUpdateSuccess) {
      clearAccountFeedback();
    }
  }, [activeTab, accountUpdateError, accountUpdateSuccess, clearAccountFeedback]);

  const workspaceValue: WorkspaceContextValue = useMemo(
    () => ({
      session,
      loading,
      error: fatalError,
      projects,
      tasks,
      changeOrders,
      projectMembers,
      projectDayEntries,
      selectedProjectId,
      setSelectedProjectId,
      recentActivities,
      upcomingDueTasks,
      accountUpdateError,
      accountUpdateSuccess,
      isUpdatingAccount,
      handleCreateProject,
      handleUpdateProject,
      handleDeleteProject,
      handleInviteMember,
      handleUpdateMemberRole,
      handleRemoveMember,
      handleSignOut,
      handleCreateTask,
      handleUpdateTask,
      handleAddFile,
      handleRemoveFile,
      handleCreatePost,
      handleUpdatePost,
      handleDeletePost,
      handleCreateChangeOrder,
      handleDeleteChangeOrder,
      handleChangeOrderStatus,
      handleUpdateAccount,
      clearAccountFeedback,
      navigateTab: (tab: WorkspaceTab) =>
        navigate(tab === "changeOrders" ? "/workspace/change-orders" : `/workspace/${tab}`),
    }),
    [
      session,
      loading,
      fatalError,
      projects,
      tasks,
      changeOrders,
      projectMembers,
      projectDayEntries,
      selectedProjectId,
      setSelectedProjectId,
      recentActivities,
      upcomingDueTasks,
      accountUpdateError,
      accountUpdateSuccess,
      isUpdatingAccount,
      handleCreateProject,
      handleUpdateProject,
      handleDeleteProject,
      handleInviteMember,
      handleUpdateMemberRole,
      handleRemoveMember,
      handleSignOut,
      handleCreateTask,
      handleUpdateTask,
      handleAddFile,
      handleRemoveFile,
      handleCreatePost,
      handleUpdatePost,
      handleDeletePost,
      handleCreateChangeOrder,
      handleDeleteChangeOrder,
      handleChangeOrderStatus,
      handleUpdateAccount,
      clearAccountFeedback,
      navigate,
    ],
  );

  if (loading) {
    return <AppLoadingScreen message="Loading your workspace..." />;
  }

  if (fatalError) {
    return <div className="app-shell">Error: {fatalError}</div>;
  }

  const content = TAB_COMPONENT[activeTab];

  if (!content) {
    return <Navigate to="/workspace/timeline" replace />;
  }

  return (
    <WorkspaceProvider value={workspaceValue}>
      <NotificationCenter />
      <WorkspaceLayout activeTab={activeTab}>
        {content}
      </WorkspaceLayout>
    </WorkspaceProvider>
  );
};
