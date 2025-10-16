import type { FeedActivity } from "../feed";

type MobileFeedCardProps = {
  activity: FeedActivity;
};

const MobileFeedCard = ({ activity }: MobileFeedCardProps) => {
  const { author, attachments } = activity;
  const statusClass = activity.statusTone
    ? ` mobile-feed-card__status--${activity.statusTone}`
    : "";

  return (
    <article className="mobile-feed-card" data-activity-type={activity.type}>
      <header className="mobile-feed-card__header">
        <span
          className="mobile-feed-card__avatar"
          style={{ background: author.color }}
          aria-hidden="true"
        >
          {author.initials}
        </span>
        <div className="mobile-feed-card__meta">
          <h3 className="mobile-feed-card__headline">{activity.headline}</h3>
          <p className="mobile-feed-card__byline">
            <span className="mobile-feed-card__author">{author.name}</span>
            {activity.projectName ? (
              <>
                {" - "}
                <span className="mobile-feed-card__project">
                  {activity.projectName}
                </span>
              </>
            ) : null}
            {" - "}
            <span className="mobile-feed-card__time">
              {formatRelativeTime(activity.createdAt)}
            </span>
          </p>
        </div>
        {activity.statusTag ? (
          <span className={`mobile-feed-card__status${statusClass}`}>
            {activity.statusTag}
          </span>
        ) : null}
      </header>

      {activity.body ? (
        <p className="mobile-feed-card__body">{activity.body}</p>
      ) : null}

      {attachments && attachments.length > 0 ? (
        <div className="mobile-feed-card__attachments">
          {attachments.map((attachment) => {
            if (attachment.type === "image" && attachment.url) {
              return (
                <a
                  key={attachment.id}
                  className="mobile-feed-card__attachment mobile-feed-card__attachment--image"
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ backgroundImage: `url(${attachment.url})` }}
                  aria-label={`Open ${attachment.name}`}
                />
              );
            }

            return (
              <a
                key={attachment.id}
                className="mobile-feed-card__attachment"
                href={attachment.url ?? "#"}
                target={attachment.url ? "_blank" : undefined}
                rel={attachment.url ? "noreferrer" : undefined}
              >
                <span className="mobile-feed-card__attachment-name">
                  {attachment.name}
                </span>
                {typeof attachment.size === "number" ? (
                  <span className="mobile-feed-card__attachment-meta">
                    {formatFileSize(attachment.size)}
                  </span>
                ) : null}
              </a>
            );
          })}
        </div>
      ) : null}

      <footer className="mobile-feed-card__actions">
        <button type="button" className="mobile-feed-card__action">
          React
        </button>
        <button type="button" className="mobile-feed-card__action">
          Comment
        </button>
        <button type="button" className="mobile-feed-card__action">
          Share
        </button>
      </footer>
    </article>
  );
};

const formatRelativeTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  const diff = date.getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const minutes = Math.round(diff / (1000 * 60));
  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, "minute");
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return formatter.format(hours, "hour");
  }
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) {
    return formatter.format(days, "day");
  }
  const weeks = Math.round(days / 7);
  if (Math.abs(weeks) < 4) {
    return formatter.format(weeks, "week");
  }
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) {
    return formatter.format(months, "month");
  }
  const years = Math.round(days / 365);
  return formatter.format(years, "year");
};

const formatFileSize = (size: number) => {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${size} B`;
};

export default MobileFeedCard;



