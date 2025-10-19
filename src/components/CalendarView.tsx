import { ChangeEvent, FormEvent, useEffect, useId, useRef, useState } from "react";
import { DayActivity, DayEntry, TaskStatus } from "../types";

type TaskReminder = {
  id: string;
  name: string;
  dueDate: string;
  status: TaskStatus;
  daysUntilDue: number;
};

type CalendarViewProps = {
  days: DayEntry[];
  onAddFile: (date: string, file: File) => void | Promise<void>;
  onRemoveFile: (date: string, fileId: string) => void | Promise<void>;
  onCreatePost: (input: { message: string; file?: File | null }) => void | Promise<void>;
  recentActivities: DayActivity[];
  upcomingDueTasks: TaskReminder[];
};

const MAX_FILE_BYTES = 100 * 1024 * 1024;

const formatDayLabel = (isoDate: string) => {
  const date = new Date(isoDate);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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

const formatTimeLabel = (isoDateTime: string | undefined) => {
  if (!isoDateTime) {
    return "";
  }
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatDueCountdown = (daysUntilDue: number) => {
  if (daysUntilDue <= 0) {
    return "Due today";
  }
  if (daysUntilDue === 1) {
    return "Due tomorrow";
  }
  return `Due in ${daysUntilDue} days`;
};

const CalendarView = ({
  days,
  onAddFile,
  onRemoveFile,
  onCreatePost,
  recentActivities,
  upcomingDueTasks,
}: CalendarViewProps) => {
  const inputIdPrefix = useId();
  const [pendingUpload, setPendingUpload] = useState<{
    date: string;
    file: File;
    baseName: string;
    extension: string;
  } | null>(null);
  const [composerMessage, setComposerMessage] = useState("");
  const [composerFile, setComposerFile] = useState<File | null>(null);
  const [composerFileName, setComposerFileName] = useState<string>("");
  const [composerFileExtension, setComposerFileExtension] = useState<string>("");
  const [composerError, setComposerError] = useState<string | null>(null);

  const handleFileInput = (date: string) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      alert("File exceeds the 100MB limit. Please choose a smaller file.");
      event.target.value = "";
      return;
    }

    const dotIndex = file.name.lastIndexOf(".");
    const extension = dotIndex !== -1 ? file.name.slice(dotIndex) : "";
    const baseName = dotIndex !== -1 ? file.name.slice(0, dotIndex) : file.name;

    setPendingUpload({
      date,
      file,
      baseName,
      extension,
    });
    event.target.value = "";
  };

  const closeModal = () => {
    setPendingUpload(null);
  };

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setPendingUpload((prev) => (prev ? { ...prev, baseName: value } : prev));
  };

  const handleUploadSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingUpload) {
      return;
    }

    const baseName = pendingUpload.baseName.trim();
    if (!baseName) {
      return;
    }

    const finalName = `${baseName}${pendingUpload.extension}`;
    const fileToUpload =
      pendingUpload.file.name === finalName
        ? pendingUpload.file
        : new File([pendingUpload.file], finalName, {
            type: pendingUpload.file.type,
            lastModified: pendingUpload.file.lastModified,
          });

    try {
      await onAddFile(pendingUpload.date, fileToUpload);
      setPendingUpload(null);
    } catch (err) {
      console.error("Error uploading file:", err);
    }
  };

  const handleComposerMessageChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setComposerMessage(value);
    if (composerError && (value.trim().length > 0 || composerFile)) {
      setComposerError(null);
    }
  };

  const handleComposerFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      alert("File exceeds the 100MB limit. Please choose a smaller file.");
      event.target.value = "";
      return;
    }

    const dotIndex = file.name.lastIndexOf(".");
    const extension = dotIndex !== -1 ? file.name.slice(dotIndex) : "";
    const baseName = dotIndex !== -1 ? file.name.slice(0, dotIndex) : file.name;

    setComposerFile(file);
    setComposerFileName(baseName);
    setComposerFileExtension(extension);
    if (composerError && (composerMessage.trim().length > 0 || file)) {
      setComposerError(null);
    }
    event.target.value = "";
  };

  const clearComposerFile = () => {
    setComposerFile(null);
    setComposerFileName("");
    setComposerFileExtension("");
  };

  const handleComposerFileNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setComposerFileName(event.target.value);
  };

  const handleComposerSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!composerMessage.trim() && !composerFile) {
      setComposerError("Add a note or attach a file before posting.");
      return;
    }

    let fileToShare = composerFile ?? undefined;
    if (composerFile) {
      const baseName = composerFileName.trim();
      if (!baseName) {
        setComposerError("Enter a name for the attached file.");
        return;
      }
      const finalName = `${baseName}${composerFileExtension}`;
      if (finalName !== composerFile.name) {
        fileToShare = new File([composerFile], finalName, {
          type: composerFile.type,
          lastModified: composerFile.lastModified,
        });
      }
    }

    try {
      await onCreatePost({ message: composerMessage, file: fileToShare });
      setComposerMessage("");
      setComposerFile(null);
      setComposerFileName("");
      setComposerFileExtension("");
      setComposerError(null);
    } catch (err) {
      console.error("Error sharing update:", err);
      setComposerError("Something went wrong while sharing. Please try again.");
    }
  };

  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const handleWheel = (event: globalThis.WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }
      event.preventDefault();
      scroller.scrollLeft += event.deltaY;
    };

    scroller.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      scroller.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const composerContent = (
    <div className="calendar__composer">
      <form className="calendar__composer-form" onSubmit={handleComposerSubmit}>
        <header className="calendar__composer-header">
          <div className="calendar__composer-avatar" aria-hidden="true">
            <span>Today</span>
          </div>
          <div className="calendar__composer-meta">
            <h3>Share today's update</h3>
            <span>Your note lands on today's timeline tile.</span>
          </div>
        </header>
        <div className="calendar__composer-field">
          <textarea
            value={composerMessage}
            onChange={handleComposerMessageChange}
            placeholder="Add a quick project update or let everyone know what's happening..."
            rows={3}
          />
        </div>
        {composerFile && (
          <div className="calendar__composer-preview">
            <div className="calendar__composer-preview-details">
              <label className="calendar__composer-label">
                File name
                <div className="calendar__composer-input-group">
                  <input
                    type="text"
                    value={composerFileName}
                    onChange={handleComposerFileNameChange}
                    required
                  />
                  {composerFileExtension && (
                    <span className="calendar__composer-suffix">{composerFileExtension}</span>
                  )}
                </div>
              </label>
              <small>{formatFileSize(composerFile.size)}</small>
            </div>
            <button
              type="button"
              className="calendar__composer-remove"
              onClick={clearComposerFile}
              aria-label="Remove attached file"
            >
              Remove
            </button>
          </div>
        )}
        {composerError && <p className="calendar__composer-error">{composerError}</p>}
        <div className="calendar__composer-footer">
          <div className="calendar__composer-toolbar">
            <label className="calendar__composer-upload">
              <input type="file" hidden onChange={handleComposerFileChange} />
              <span>Attach file</span>
            </label>
            {composerFile && (
              <button type="button" className="calendar__composer-remove" onClick={clearComposerFile}>
                Remove file
              </button>
            )}
          </div>
          <button type="submit" className="calendar__composer-submit">
            Share update
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <section className="calendar">
      <div className="calendar__header">
        <div>
          <h2>Daily updates</h2>
          <p>Share quick notes or drop files&mdash;everything lands on the correct day automatically.</p>
        </div>
      </div>

      <section className="calendar__reminders" aria-label="Project reminders">
        <div className="calendar__reminder-group">
          <header className="calendar__reminder-header">
            <h3>Upcoming due dates</h3>
            <span>Next 7 days</span>
          </header>
          {upcomingDueTasks.length > 0 ? (
            <ul className="calendar__reminder-list">
              {upcomingDueTasks.map((task) => (
                <li key={task.id} className="calendar__reminder">
                  <div className="calendar__reminder-meta">
                    <strong>{task.name}</strong>
                    <span>{formatDueCountdown(task.daysUntilDue)}</span>
                  </div>
                  <span className="calendar__reminder-date">{formatDayLabel(task.dueDate)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="calendar__reminder-empty">No due dates in the next week.</p>
          )}
        </div>
      </section>

      {composerContent}

      <div className="calendar__recent">
        <h3>Recent activity</h3>
        {recentActivities.length > 0 ? (
          <ul className="calendar__recent-list">
            {recentActivities.map((activity) => (
              <li key={activity.id} className="calendar__recent-item">
                <div className="calendar__recent-row">
                  <span className={`calendar__recent-badge calendar__recent-badge--${activity.type}`}>
                    {activity.type === "post" ? "Post" : "File"}
                  </span>
                  <span className="calendar__recent-meta">
                    {formatDayLabel(activity.date)} &bull; {formatTimeLabel(activity.createdAt)}
                  </span>
                </div>
                {activity.authorName && <p className="calendar__recent-author">by {activity.authorName}</p>}
                <p className="calendar__recent-title">{activity.title}</p>
                {activity.details && <p className="calendar__recent-details">{activity.details}</p>}
                {activity.attachments && activity.attachments.length > 0 && (
                  <div className="calendar__recent-attachments">
                    {activity.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.url}
                        download={attachment.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`calendar__recent-attachment${
                          attachment.type?.startsWith("image/") ? " calendar__recent-attachment--image" : ""
                        }`}
                      >
                        {attachment.type?.startsWith("image/") ? (
                          <>
                            <div className="calendar__recent-thumb">
                              {attachment.url ? (
                                <img src={attachment.url} alt={attachment.name} />
                              ) : (
                                <span className="calendar__recent-thumb-fallback" />
                              )}
                            </div>
                            <div className="calendar__recent-attachment-copy">
                              <span>{attachment.name}</span>
                              <small>{formatFileSize(attachment.size)}</small>
                            </div>
                          </>
                        ) : (
                          <>
                            <span>{attachment.name}</span>
                            <small>{formatFileSize(attachment.size)}</small>
                          </>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="calendar__recent-empty">Your latest activity will appear here.</p>
        )}
      </div>

      <div className="calendar__scroller" ref={scrollerRef}>
        {days.map((day, index) => (
          <article key={day.date} className="calendar__tile">
            <header className="calendar__tile-header">
              <div>
                <strong>{formatDayLabel(day.date)}</strong>
                <small>
                  {day.posts.length} update{day.posts.length === 1 ? "" : "s"} &bull; {day.files.length} file
                  {day.files.length === 1 ? "" : "s"}
                </small>
              </div>
              <label className="calendar__upload">
                <input
                  id={`${inputIdPrefix}-${index}`}
                  type="file"
                  onChange={handleFileInput(day.date)}
                  hidden
                />
                <span>+ Add file</span>
              </label>
            </header>
            <div className="calendar__tile-body">
              {day.posts.length > 0 && (
                <div className="calendar__posts">
                  {day.posts.map((post) => (
                    <article key={post.id} className="calendar__post">
                      <header className="calendar__post-header">
                        <span className="calendar__post-author">{post.authorName ?? "Project update"}</span>
                        {post.createdAt && (
                          <span className="calendar__post-time">{formatTimeLabel(post.createdAt)}</span>
                        )}
                      </header>
                      {post.message && <p className="calendar__post-message">{post.message}</p>}
                      {post.attachments.length > 0 && (
                        <div className="calendar__post-attachments">
                          {post.attachments.map((attachment) => (
                            <a
                              key={attachment.id}
                              href={attachment.url}
                              download={attachment.name}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`calendar__post-attachment${
                                attachment.type?.startsWith("image/") ? " calendar__post-attachment--image" : ""
                              }`}
                            >
                              {attachment.type?.startsWith("image/") ? (
                                <>
                                  <div className="calendar__post-thumb" aria-hidden="true">
                                    {attachment.url ? (
                                      <img src={attachment.url} alt={attachment.name} />
                                    ) : (
                                      <span className="calendar__post-thumb-fallback" />
                                    )}
                                  </div>
                                  <div className="calendar__post-attachment-meta">
                                    <span>{attachment.name}</span>
                                    <small>{formatFileSize(attachment.size)}</small>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <span>{attachment.name}</span>
                                  <small>{formatFileSize(attachment.size)}</small>
                                </>
                              )}
                            </a>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}

              {day.files.length > 0 && (
                <div className="calendar__files">
                  {day.files.map((file) => (
                    <div key={file.id} className="calendar__file">
                      <div className="calendar__file-meta">
                        <span className="calendar__file-name">{file.name}</span>
                        <small>{formatFileSize(file.size)}</small>
                        {file.uploadedByName && <small>Uploaded by {file.uploadedByName}</small>}
                      </div>
                      <div className="calendar__file-actions">
                        <a href={file.url} download={file.name} className="calendar__link">
                          Download
                        </a>
                        <button
                          type="button"
                          className="calendar__remove"
                          onClick={() => onRemoveFile(day.date, file.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {day.posts.length === 0 && day.files.length === 0 && (
                <div className="calendar__empty">Share an update or upload a file to fill this day.</div>
              )}
            </div>
          </article>
        ))}
      </div>

      {pendingUpload && (
        <div className="modal">
          <div className="modal__backdrop" onClick={closeModal} />
          <div className="modal__dialog" role="dialog" aria-modal="true">
            <form className="modal__form" onSubmit={handleUploadSubmit}>
              <header className="modal__header">
                <h3>Rename file</h3>
                <button type="button" className="modal__close" onClick={closeModal} aria-label="Close file rename form">
                  X
                </button>
              </header>
              <p className="modal__description">
                You can personalize how the file appears on the schedule before uploading it.
              </p>
              <label>
                File name
                <div className="modal__input-group">
                  <input
                    type="text"
                    value={pendingUpload.baseName}
                    onChange={handleNameChange}
                    required
                    autoFocus
                  />
                  {pendingUpload.extension && <span className="modal__suffix">{pendingUpload.extension}</span>}
                </div>
              </label>
              <div className="modal__details">
                <span>{formatFileSize(pendingUpload.file.size)}</span>
                <span>Selected date: {formatDayLabel(pendingUpload.date)}</span>
              </div>
              <div className="modal__actions">
                <button type="button" className="modal__secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="modal__primary">
                  Save & upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default CalendarView;
