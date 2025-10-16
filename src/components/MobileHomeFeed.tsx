import { useEffect } from "react";
import type { FeedActivity, StoryEntry } from "../feed";
import MobileFeedCard from "./MobileFeedCard";
import MobileStoryRail from "./MobileStoryRail";

type MobileHomeFeedProps = {
  projectName?: string | null;
  projectReference?: string | null;
  stories: StoryEntry[];
  activities: FeedActivity[];
  highlightComposer: boolean;
  onComposerSettled: () => void;
  onRequestCompose: () => void;
};

const MobileHomeFeed = ({
  projectName,
  projectReference,
  stories,
  activities,
  highlightComposer,
  onComposerSettled,
  onRequestCompose,
}: MobileHomeFeedProps) => {
  useEffect(() => {
    if (!highlightComposer) {
      return;
    }
    const timeout = window.setTimeout(() => {
      onComposerSettled();
    }, 1200);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [highlightComposer, onComposerSettled]);

  const taskCount = activities.filter((item) => item.type === "task-update").length;
  const noteCount = activities.filter((item) => item.type === "note").length;
  const changeOrderCount = activities.filter((item) => item.type === "change-order").length;

  return (
    <section className="mobile-feed">
      <header className="mobile-feed__hero">
        <div className="mobile-feed__hero-content">
          <p className="mobile-feed__hero-label">Today&apos;s focus</p>
          <h2 className="mobile-feed__hero-title">
            {projectName ?? "Clearview projects"}
          </h2>
          {projectReference ? (
            <p className="mobile-feed__hero-subtitle">
              Reference - {projectReference}
            </p>
          ) : null}
          <dl className="mobile-feed__hero-metrics">
            <div>
              <dt>Tasks</dt>
              <dd>{taskCount}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{noteCount}</dd>
            </div>
            <div>
              <dt>Orders</dt>
              <dd>{changeOrderCount}</dd>
            </div>
          </dl>
        </div>
        <div className="mobile-feed__hero-actions">
          <button
            type="button"
            className="mobile-feed__primary-action"
            onClick={onRequestCompose}
          >
            Share update
          </button>
          <button
            type="button"
            className="mobile-feed__secondary-action"
            onClick={onRequestCompose}
          >
            Upload photo
          </button>
        </div>
      </header>

      <section className="mobile-feed__stories" aria-label="Project stories">
        <div className="mobile-feed__section-heading">
          <h3>Stories</h3>
          <button type="button" className="mobile-feed__section-link" onClick={onRequestCompose}>
            Add
          </button>
        </div>
        <MobileStoryRail stories={stories} onSelectStory={onRequestCompose} />
      </section>

      <section
        className={`mobile-feed__composer${
          highlightComposer ? " mobile-feed__composer--active" : ""
        }`}
      >
        <button
          type="button"
          className="mobile-feed__composer-trigger"
          onClick={onRequestCompose}
        >
          What&apos;s happening on site?
        </button>
        <div className="mobile-feed__composer-actions">
          <button type="button" onClick={onRequestCompose}>Note</button>
          <button type="button" onClick={onRequestCompose}>Photo</button>
          <button type="button" onClick={onRequestCompose}>Task</button>
        </div>
      </section>

      <section className="mobile-feed__activity" aria-label="Activity feed">
        <div className="mobile-feed__section-heading">
          <h3>Latest activity</h3>
        </div>
        {activities.length === 0 ? (
          <p className="mobile-feed__empty">
            No activity yet. Start by sharing an update or uploading site photos.
          </p>
        ) : (
          <div className="mobile-feed__list">
            {activities.map((activity) => (
              <MobileFeedCard key={activity.id} activity={activity} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
};

export default MobileHomeFeed;

