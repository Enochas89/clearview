type WorkspaceTab = "timeline" | "changeOrders" | "account";

type WorkspaceTabsProps = {
  activeTab: WorkspaceTab;
  onSelect: (tab: WorkspaceTab) => void;
};

const TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "timeline", label: "Timeline" },
  { id: "changeOrders", label: "Change Orders" },
  { id: "account", label: "Account" },
];

export const WorkspaceTabs = ({ activeTab, onSelect }: WorkspaceTabsProps) => (
  <div className="app__tabs" role="tablist" aria-label="Workspace view">
    {TABS.map((tab) => (
      <button
        key={tab.id}
        type="button"
        className={`app__tab${activeTab === tab.id ? " is-active" : ""}`}
        role="tab"
        aria-selected={activeTab === tab.id}
        onClick={() => onSelect(tab.id)}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

export type { WorkspaceTab };

