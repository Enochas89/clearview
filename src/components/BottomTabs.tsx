import type { ReactNode } from "react";

type TabKey = "home" | "stories" | "messages" | "files" | "profile";

type BottomTabsProps = {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
  onCompose?: () => void;
};

const iconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const HomeIcon = () => (
  <svg {...iconProps} aria-hidden="true">
    <path d="M3 9.5 12 3l9 6.5" />
    <path d="M5 11v9h14v-9" />
    <path d="M9 21V12h6v9" />
  </svg>
);

const StoriesIcon = () => (
  <svg {...iconProps} aria-hidden="true">
    <circle cx="12" cy="12" r="3.5" />
    <path d="M5 12a7 7 0 0 1 7-7" />
    <path d="M12 19a7 7 0 0 1-7-7" />
    <path d="M19 12a7 7 0 0 1-7 7" />
    <path d="M12 5a7 7 0 0 1 7 7" />
  </svg>
);

const MessagesIcon = () => (
  <svg {...iconProps} aria-hidden="true">
    <path d="M21 11.5a7.5 7.5 0 0 1-11 6.5L5 20l1-4.5a7.5 7.5 0 1 1 15 0z" />
    <path d="M8 10h8" />
    <path d="M8 13h5" />
  </svg>
);

const FilesIcon = () => (
  <svg {...iconProps} aria-hidden="true">
    <path d="M4 4h7l3 3h6v13H4z" />
    <path d="M4 4v16h16" />
  </svg>
);

const ProfileIcon = () => (
  <svg {...iconProps} aria-hidden="true">
    <circle cx="12" cy="8" r="3" />
    <path d="M6 19v-1a6 6 0 0 1 12 0v1" />
  </svg>
);

const ITEMS: Array<{ key: TabKey; label: string; icon: ReactNode }> = [
  { key: "home", label: "Home", icon: <HomeIcon /> },
  { key: "stories", label: "Stories", icon: <StoriesIcon /> },
  { key: "messages", label: "Messages", icon: <MessagesIcon /> },
  { key: "files", label: "Files", icon: <FilesIcon /> },
  { key: "profile", label: "Profile", icon: <ProfileIcon /> },
];

const BottomTabs = ({ activeTab, onChange, onCompose }: BottomTabsProps) => (
  <nav className="bottom-tabs" aria-label="App navigation">
    <ul className="bottom-tabs__list">
      {ITEMS.map(({ key, label, icon }) => {
        const isActive = activeTab === key;
        return (
          <li key={key} className="bottom-tabs__item">
            <button
              type="button"
              className={`bottom-tabs__button${
                isActive ? " bottom-tabs__button--active" : ""
              }`}
              onClick={() => onChange(key)}
              aria-current={isActive ? "page" : undefined}
              title={label}
            >
              <span className="bottom-tabs__icon">{icon}</span>
              <span className="bottom-tabs__label">{label}</span>
            </button>
          </li>
        );
      })}
    </ul>
    {onCompose ? (
      <button
        type="button"
        className="bottom-tabs__compose"
        onClick={onCompose}
        aria-label="Compose update"
      >
        <span>+</span>
      </button>
    ) : null}
  </nav>
);

export type { TabKey };
export default BottomTabs;
