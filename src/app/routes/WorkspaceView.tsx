import { Navigate, useParams } from "react-router-dom";
import { useMemo } from "react";
import TimelineView from "../../features/timeline/TimelineView";
import ChangeOrdersView from "../../features/change-orders/ChangeOrdersView";
import AccountView from "../../features/account/AccountView";
import { WorkspaceLayout } from "../WorkspaceLayout";
import type { WorkspaceTab } from "../WorkspaceTabs";

const TAB_COMPONENTS: Record<WorkspaceTab, React.ReactNode> = {
  timeline: <TimelineView />,
  changeOrders: <ChangeOrdersView />,
  account: <AccountView />,
};

export const WorkspaceView = ({
  activeTab,
  onTabChange,
}: {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
}) => {
  const params = useParams<{ tab?: string }>();
  const requestedTab = params.tab === "change-orders" ? "changeOrders" : params.tab;
  const tab = (requestedTab as WorkspaceTab) ?? activeTab;

  const content = useMemo(() => TAB_COMPONENTS[tab], [tab]);

  if (!content) {
    return <Navigate to="/workspace/timeline" replace />;
  }

  return (
    <WorkspaceLayout activeTab={tab} onTabChange={onTabChange}>
      {content}
    </WorkspaceLayout>
  );
};
