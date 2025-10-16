import type { StoryEntry } from "../feed";

type MobileStoryRailProps = {
  stories: StoryEntry[];
  onSelectStory?: (storyId: string) => void;
};

const MobileStoryRail = ({ stories, onSelectStory }: MobileStoryRailProps) => {
  if (stories.length === 0) {
    return (
      <div className="mobile-story-rail mobile-story-rail--empty">
        <p>No recent stories yet. Upload photos to bring this feed to life.</p>
      </div>
    );
  }

  return (
    <div className="mobile-story-rail" role="list">
      {stories.map((story) => {
        const hasCover = Boolean(story.coverUrl);
        return (
          <button
            key={story.id}
            type="button"
            className={`mobile-story-rail__item${
              story.type === "image"
                ? " mobile-story-rail__item--media"
                : " mobile-story-rail__item--doc"
            }`}
            style={
              hasCover
                ? {
                    backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0) 40%, rgba(15, 23, 42, 0.55) 100%), url(${story.coverUrl})`,
                  }
                : { background: story.fallbackColor }
            }
            onClick={() => onSelectStory?.(story.id)}
            role="listitem"
          >
            <span className="mobile-story-rail__ring" aria-hidden="true" />
            <span className="mobile-story-rail__title">{story.title}</span>
            <span className="mobile-story-rail__subtitle">
              {story.projectName}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default MobileStoryRail;
