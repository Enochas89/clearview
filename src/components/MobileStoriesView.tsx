import type { StoryEntry } from "../feed";

type MobileStoriesViewProps = {
  stories: StoryEntry[];
  onSelectStory?: (storyId: string) => void;
};

const MobileStoriesView = ({ stories, onSelectStory }: MobileStoriesViewProps) => {
  if (stories.length === 0) {
    return (
      <section className="mobile-stories">
        <h2>Stories</h2>
        <p className="mobile-stories__empty">
          We&apos;ll collect photo and document highlights here as soon as your team starts posting.
        </p>
      </section>
    );
  }

  return (
    <section className="mobile-stories">
      <h2>Stories</h2>
      <div className="mobile-stories__grid">
        {stories.map((story) => (
          <button
            key={story.id}
            type="button"
            className="mobile-stories__tile"
            style={
              story.coverUrl
                ? {
                    backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.3) 0%, rgba(15, 23, 42, 0.7) 100%), url(${story.coverUrl})`,
                  }
                : { background: story.fallbackColor }
            }
            onClick={() => onSelectStory?.(story.id)}
          >
            <span className="mobile-stories__tile-title">{story.title}</span>
            <span className="mobile-stories__tile-meta">
              {story.projectName} - {new Date(story.createdAt).toLocaleDateString()}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default MobileStoriesView;

