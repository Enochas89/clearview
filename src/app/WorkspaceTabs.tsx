type WorkspaceTab = "timeline" | "gantt" | "changeOrders" | "account";

type WorkspaceTabDefinition = {
  id: WorkspaceTab;
  label: string;
};

type WorkspaceTabsProps = {
  activeTab: WorkspaceTab;
  onSelect: (tab: WorkspaceTab) => void;
  tabs?: WorkspaceTabDefinition[];
  orientation?: "horizontal" | "vertical";
};

const DEFAULT_TABS: WorkspaceTabDefinition[] = [
  { id: "timeline", label: "Timeline" },
  { id: "gantt", label: "Gantt" },
  { id: "changeOrders", label: "Change Orders" },
  { id: "account", label: "Account" },
];

export const WorkspaceTabs = ({
  activeTab,
  onSelect,
  tabs = DEFAULT_TABS,
  orientation = "horizontal",
}: WorkspaceTabsProps) => (
  <div
    className={`app__tabs app__tabs--${orientation}`}
    role="tablist"
    aria-label="Workspace view"
  >
    {tabs.map((tab) => (
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

export const WORKSPACE_TABS = DEFAULT_TABS;

export type { WorkspaceTab, WorkspaceTabDefinition };
