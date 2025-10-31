import SidebarPanel from "../features/sidebar/SidebarPanel";
import { WorkspaceTabs, WorkspaceTab } from "./WorkspaceTabs";
import { useWorkspace } from "../workspace/WorkspaceContext";

type WorkspaceLayoutProps = {
  activeTab: WorkspaceTab;
  children: React.ReactNode;
};

export const WorkspaceLayout = ({ activeTab, children }: WorkspaceLayoutProps) => {
  const { navigateTab, session } = useWorkspace();

  const user = session?.user ?? null;
  const displayName =
    user?.user_metadata?.full_name?.trim() ||
    user?.email ||
    "Your account";

  return (
    <div className="app-shell">
      <div className="app">
        <SidebarPanel />
        <main className="app__main">
          {user && (
            <div className="app__user-banner" role="status" aria-live="polite">
              <div className="app__user-meta">
                <span className="app__user-label">Logged in as</span>
                <span className="app__user-name">{displayName}</span>
              </div>
              <button
                type="button"
                className="app__user-action"
                onClick={() => navigateTab("account")}
              >
                Edit account
              </button>
            </div>
          )}
          <WorkspaceTabs activeTab={activeTab} onSelect={navigateTab} />
          {children}
        </main>
      </div>
    </div>
  );
};
