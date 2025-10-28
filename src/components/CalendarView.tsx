import { ChangeEvent, FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { DayActivity, DayEntry, DayFile, DayPost, TaskStatus } from "../types";

type TaskReminder = {
  id: string;
  name: string;
  dueDate: string;
  status: TaskStatus;
  daysUntilDue: number;
};

type CalendarViewProps = {
  activeProjectId: string | null;
  days: DayEntry[];
  onAddFile: (date: string, file: File) => void | Promise<void>;
  onRemoveFile: (date: string, fileId: string) => void | Promise<void>;
  onCreatePost: (input: { message: string; file?: File | null }) => void | Promise<void>;
  onUpdatePost: (postId: string, message: string) => void | Promise<void>;
  onDeletePost: (postId: string, attachments: DayFile[]) => void | Promise<void>;
  recentActivities: DayActivity[];
  upcomingDueTasks: TaskReminder[];
};

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const DOCUMENT_ICON_SRC = new URL("../assets/doc.png", import.meta.url).href;
const PDF_ICON_SRC = new URL("../assets/pdf.png", import.meta.url).href;
const IMAGE_ICON_SRC = new URL("../assets/pic.png", import.meta.url).href;
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "bmp", "tiff", "webp", "svg", "heic", "heif"]);

const getFileExtension = (fileName: string | undefined) => {
  if (!fileName) {
    return "";
  }
  const lastDot = fileName.lastIndexOf(".");
  return lastDot >= 0 ? fileName.slice(lastDot + 1).toLowerCase() : "";
};

const isImageFile = (file: Pick<DayFile, "type" | "name">) => {
  if (file.type && file.type.startsWith("image/")) {
    return true;
  }
  return IMAGE_EXTENSIONS.has(getFileExtension(file.name));
};

const isPdfFile = (file: Pick<DayFile, "type" | "name">) => {
  if (file.type === "application/pdf") {
    return true;
  }
  return getFileExtension(file.name) === "pdf";
};

const getFileIconSrc = (file: Pick<DayFile, "type" | "name">) => {
  if (isImageFile(file)) {
    return IMAGE_ICON_SRC;
  }
  if (isPdfFile(file)) {
    return PDF_ICON_SRC;
  }
  return DOCUMENT_ICON_SRC;
};

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

const CalendarView = ({ activeProjectId,
  days,
  onAddFile,
  onRemoveFile,
  onCreatePost,
  onUpdatePost,
  onDeletePost,
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
  const [previewAttachment, setPreviewAttachment] = useState<{
    attachment: DayFile;
    activityTitle: string;
  } | null>(null);
  const [editingPost, setEditingPost] = useState<{ id: string; message: string; originalMessage: string } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [pendingDeletePostId, setPendingDeletePostId] = useState<string | null>(null);
  const [pendingDeleteFileId, setPendingDeleteFileId] = useState<string | null>(null);
  const [openActionMenuKey, setOpenActionMenuKey] = useState<string | null>(null);

  const findPostById = useCallback(
    (postId: string): DayPost | null => {
      for (const day of days) {
        const match = day.posts.find((post) => post.id === postId);
        if (match) {
          return match;
        }
      }
      return null;
    },
    [days],
  );

  const composerStorageKey = activeProjectId ? `calendarComposerDraft:${activeProjectId}` : null;
  const lastLoadedComposerKeyRef = useRef<string | null>(null);
  const previewDialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !composerStorageKey) {
      return;
    }

    if (lastLoadedComposerKeyRef.current === composerStorageKey) {
      return;
    }

    lastLoadedComposerKeyRef.current = composerStorageKey;

    try {
      const raw = window.localStorage.getItem(composerStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setComposerMessage(typeof parsed.message === "string" ? parsed.message : "");
      } else {
        setComposerMessage("");
      }
    } catch (err) {
      console.error("Error loading composer draft:", err);
      setComposerMessage("");
    }

    setComposerFile(null);
    setComposerFileName("");
    setComposerFileExtension("");
  }, [composerStorageKey]);

  useEffect(() => {
    if (!composerStorageKey || typeof window === "undefined") {
      return;
    }
    const trimmed = composerMessage.trim();
    if (!trimmed) {
      window.localStorage.removeItem(composerStorageKey);
      return;
    }
    try {
      window.localStorage.setItem(composerStorageKey, JSON.stringify({ message: composerMessage }));
    } catch (err) {
      console.error("Error saving composer draft:", err);
    }
  }, [composerMessage, composerStorageKey]);

  useEffect(() => {
    if (!previewAttachment || typeof window === "undefined") {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewAttachment(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewAttachment]);

  useEffect(() => {
    if (!previewAttachment || typeof window === "undefined") {
      return;
    }
    const rafId = window.requestAnimationFrame(() => {
      const dialog = previewDialogRef.current;
      if (!dialog) {
        return;
      }
      dialog.focus({ preventScroll: true });
      dialog.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [previewAttachment]);

  useEffect(() => {
    if (!openActionMenuKey) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(`[data-action-menu="${openActionMenuKey}"]`)) {
        setOpenActionMenuKey(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenActionMenuKey(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openActionMenuKey]);


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

  const closePreviewModal = () => {
    setPreviewAttachment(null);
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

  const toggleActionMenu = (key: string) => {
    setOpenActionMenuKey((current) => (current === key ? null : key));
  };

  const handleTimelineEditClick = (postId: string) => {
    const post = findPostById(postId);
    if (post) {
      openEditPostModal(post);
    } else {
      setOpenActionMenuKey(null);
    }
  };

  const handleTimelineDeleteClick = (postId: string) => {
    const post = findPostById(postId);
    if (post) {
      handleDeletePostClick(post);
    } else {
      setOpenActionMenuKey(null);
    }
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

  const openEditPostModal = (post: DayPost) => {
    setOpenActionMenuKey(null);
    setEditingPost({
      id: post.id,
      message: post.message,
      originalMessage: post.message,
    });
    setEditError(null);
  };

  const closeEditPostModal = () => {
    setEditingPost(null);
    setEditError(null);
    setIsSavingEdit(false);
  };

  const handleEditPostChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setEditingPost((prev) => (prev ? { ...prev, message: value } : prev));
    if (editError && value.trim().length > 0) {
      setEditError(null);
    }
  };

  const handleEditPostSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingPost) {
      return;
    }

    const trimmed = editingPost.message.trim();
    const originalTrimmed = editingPost.originalMessage.trim();

    if (trimmed === originalTrimmed) {
      closeEditPostModal();
      return;
    }

    try {
      setIsSavingEdit(true);
      setEditError(null);
      await Promise.resolve(onUpdatePost(editingPost.id, trimmed));
      closeEditPostModal();
    } catch (err: any) {
      console.error("Error updating post:", err);
      setEditError(err?.message ?? "Failed to update post.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeletePostClick = async (post: DayPost) => {
    const shouldDelete =
      typeof window === "undefined"
        ? true
        : window.confirm(
            post.attachments.length > 0
              ? "Delete this update and its attached files?"
              : "Delete this update?"
          );

    if (!shouldDelete) {
      return;
    }

    setOpenActionMenuKey(null);

    try {
      setPendingDeletePostId(post.id);
      await Promise.resolve(onDeletePost(post.id, post.attachments));
    } catch (err: any) {
      console.error("Error deleting post:", err);
      if (typeof window !== "undefined") {
        window.alert(err?.message ?? "Failed to delete update.");
      }
    } finally {
      setPendingDeletePostId(null);
    }
  };

  const handleFileDelete = async (
    date: string,
    fileId: string,
    options: { confirm?: boolean } = {},
  ) => {
    const { confirm = false } = options;
    if (confirm && typeof window !== "undefined") {
      const shouldDelete = window.confirm("Delete this file?");
      if (!shouldDelete) {
        return;
      }
    }

    setOpenActionMenuKey(null);

    try {
      setPendingDeleteFileId(fileId);
      await Promise.resolve(onRemoveFile(date, fileId));
    } catch (err: any) {
      console.error("Error removing file:", err);
      if (typeof window !== "undefined") {
        window.alert(err?.message ?? "Failed to delete file.");
      }
    } finally {
      setPendingDeleteFileId(null);
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
              <input type="file" hidden accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx" capture="environment" onChange={handleComposerFileChange} />
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
        <h3>Timeline</h3>
        {recentActivities.length > 0 ? (
          <ul className="calendar__recent-list">
            {recentActivities.map((activity) => {
              const isPostActivity = activity.type === "post";
              const fileAttachment = !isPostActivity ? activity.attachments?.[0] ?? null : null;
              const menuKey = isPostActivity
                ? `post:${activity.id}`
                : fileAttachment
                ? `file:${fileAttachment.id}`
                : null;

              return (
                <li key={activity.id} className="calendar__recent-item">
                  <div className="calendar__recent-row">
                    <div className="calendar__recent-info">
                      <span className={`calendar__recent-badge calendar__recent-badge--${activity.type}`}>
                        {isPostActivity ? "Post" : "File"}
                      </span>
                      <span className="calendar__recent-meta">
                        {formatDayLabel(activity.date)}{" \u2022 "}{formatTimeLabel(activity.createdAt)}
                      </span>
                    </div>
                    {menuKey && (
                      <div className="calendar__post-menu-wrapper" data-action-menu={menuKey}>
                        <button
                          type="button"
                          className="calendar__post-menu-toggle"
                          aria-haspopup="true"
                          aria-expanded={openActionMenuKey === menuKey}
                          aria-label="Show timeline actions"
                          onClick={() => toggleActionMenu(menuKey)}
                        >
                          &#8230;
                        </button>
                        {openActionMenuKey === menuKey && (
                          <div className="calendar__post-menu" role="menu">
                            {isPostActivity ? (
                              <>
                                <button
                                  type="button"
                                  className="calendar__post-menu-item"
                                  role="menuitem"
                                  onClick={() => handleTimelineEditClick(activity.id)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="calendar__post-menu-item calendar__post-menu-item--danger"
                                  role="menuitem"
                                  onClick={() => handleTimelineDeleteClick(activity.id)}
                                  disabled={pendingDeletePostId === activity.id}
                                >
                                  {pendingDeletePostId === activity.id ? "Removing..." : "Delete"}
                                </button>
                              </>
                            ) : (
                              fileAttachment && (
                                <>
                                  <a
                                    className="calendar__post-menu-item"
                                    role="menuitem"
                                    href={fileAttachment.url}
                                    download={fileAttachment.name}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setOpenActionMenuKey(null)}
                                  >
                                    Download
                                  </a>
                                  <button
                                    type="button"
                                    className="calendar__post-menu-item calendar__post-menu-item--danger"
                                    role="menuitem"
                                    onClick={() => handleFileDelete(activity.date, fileAttachment.id, { confirm: true })}
                                    disabled={pendingDeleteFileId === fileAttachment.id}
                                  >
                                    {pendingDeleteFileId === fileAttachment.id ? "Removing..." : "Delete"}
                                  </button>
                                </>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {activity.authorName && <p className="calendar__recent-author">by {activity.authorName}</p>}
                  <p className="calendar__recent-title">{activity.title}</p>
                  {activity.details && <p className="calendar__recent-details">{activity.details}</p>}
                  {activity.attachments && activity.attachments.length > 0 && (
                    <div className="calendar__recent-attachments">
                      {activity.attachments.map((attachment) => {
                        const isImage = attachment.type?.startsWith("image/");
                        return (
                          <a
                            key={attachment.id}
                            href={attachment.url}
                            download={isImage ? undefined : attachment.name}
                            target={isImage ? undefined : "_blank"}
                            rel={isImage ? undefined : "noopener noreferrer"}
                            className={`calendar__recent-attachment${
                              isImage ? " calendar__recent-attachment--image" : ""
                            }`}
                            aria-haspopup={isImage ? "dialog" : undefined}
                            onClick={(event) => {
                              if (!isImage) {
                                return;
                              }
                              event.preventDefault();
                              setPreviewAttachment({
                                attachment,
                                activityTitle: activity.title,
                              });
                            }}
                          >
                            {isImage ? (
                              <>
                                <div className="calendar__recent-thumb">
                                  {attachment.url ? (
                                    <img src={attachment.url} alt={attachment.name} loading="lazy" />
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
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="calendar__recent-empty">Your timeline will appear here.</p>
        )}
      </div>

      <div className="calendar__scroller" ref={scrollerRef}>
        {days.map((day, index) => (
          <article key={day.date} className="calendar__tile">
            <header className="calendar__tile-header">
              <div>
                <strong>{formatDayLabel(day.date)}</strong>
                <small>
                  {day.posts.length} update{day.posts.length === 1 ? "" : "s"}{" \u2022 "}{day.files.length} file
                  {day.files.length === 1 ? "" : "s"}
                </small>
              </div>
              <label className="calendar__upload">
                <input
                  id={`${inputIdPrefix}-${index}`}
                  type="file"
                  accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
                  capture="environment"
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
                        <div className="calendar__post-meta">
                          <span className="calendar__post-author">{post.authorName ?? "Project update"}</span>
                          {post.createdAt && (
                            <span className="calendar__post-time">{formatTimeLabel(post.createdAt)}</span>
                          )}
                        </div>
                        <div className="calendar__post-menu-wrapper" data-action-menu={`post:${post.id}`}>
                          <button
                            type="button"
                            className="calendar__post-menu-toggle"
                            aria-haspopup="true"
                            aria-expanded={openActionMenuKey === `post:${post.id}`}
                            aria-label="Show post actions"
                            onClick={() => toggleActionMenu(`post:${post.id}`)}
                          >
                            &#8230;
                          </button>
                          {openActionMenuKey === `post:${post.id}` && (
                            <div className="calendar__post-menu" role="menu">
                              <button
                                type="button"
                                className="calendar__post-menu-item"
                                role="menuitem"
                                onClick={() => openEditPostModal(post)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="calendar__post-menu-item calendar__post-menu-item--danger"
                                role="menuitem"
                                onClick={() => handleDeletePostClick(post)}
                                disabled={pendingDeletePostId === post.id}
                              >
                                {pendingDeletePostId === post.id ? "Removing..." : "Delete"}
                              </button>
                            </div>
                          )}
                        </div>
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
                                      <img src={attachment.url} alt={attachment.name} loading="lazy" />
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
                  {day.files.map((file) => {
                    const iconSrc = getFileIconSrc(file);
                    return (
                      <div key={file.id} className="calendar__file">
                        <div className="calendar__file-header">
                          <div className="calendar__file-info">
                            <img
                              src={iconSrc}
                              alt=""
                              className="calendar__file-icon"
                              aria-hidden="true"
                            />
                            <div className="calendar__file-meta">
                              <span className="calendar__file-name">{file.name}</span>
                              <small>{formatFileSize(file.size)}</small>
                              {file.uploadedByName && <small>Uploaded by {file.uploadedByName}</small>}
                            </div>
                          </div>
                          <div className="calendar__post-menu-wrapper" data-action-menu={`file:${file.id}`}>
                            <button
                              type="button"
                              className="calendar__post-menu-toggle"
                              aria-haspopup="true"
                              aria-expanded={openActionMenuKey === `file:${file.id}`}
                              aria-label="Show file actions"
                              onClick={() => toggleActionMenu(`file:${file.id}`)}
                            >
                              &#8230;
                            </button>
                            {openActionMenuKey === `file:${file.id}` && (
                              <div className="calendar__post-menu" role="menu">
                                <a
                                  className="calendar__post-menu-item"
                                  role="menuitem"
                                  href={file.url}
                                  download={file.name}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => setOpenActionMenuKey(null)}
                                >
                                  Download
                                </a>
                                <button
                                  type="button"
                                  className="calendar__post-menu-item calendar__post-menu-item--danger"
                                  role="menuitem"
                                  onClick={() => handleFileDelete(day.date, file.id)}
                                  disabled={pendingDeleteFileId === file.id}
                                >
                                  {pendingDeleteFileId === file.id ? "Removing..." : "Delete"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {day.posts.length === 0 && day.files.length === 0 && (
                <div className="calendar__empty">Share an update or upload a file to fill this day.</div>
              )}
            </div>
          </article>
        ))}
      </div>

      {previewAttachment && (
        <div className="modal">
          <div className="modal__backdrop" onClick={closePreviewModal} />
          <div
            className="modal__dialog modal__dialog--preview"
            role="dialog"
            aria-modal="true"
            aria-label="Image attachment preview"
            tabIndex={-1}
            ref={previewDialogRef}
          >
            <div className="modal__preview-header">
              <div className="modal__preview-heading">
                <h3>{previewAttachment.attachment.name}</h3>
                {previewAttachment.activityTitle && (
                  <span className="modal__preview-subtitle">{previewAttachment.activityTitle}</span>
                )}
              </div>
              <button
                type="button"
                className="modal__close"
                onClick={closePreviewModal}
                aria-label="Close image preview"
              >
                X
              </button>
            </div>
            <div className="modal__preview-body">
              <img src={previewAttachment.attachment.url} alt={previewAttachment.attachment.name} />
            </div>
            <div className="modal__preview-footer">
              <span>{formatFileSize(previewAttachment.attachment.size)}</span>
              <a
                href={previewAttachment.attachment.url}
                download={previewAttachment.attachment.name}
                className="modal__preview-download"
              >
                Download
              </a>
            </div>
          </div>
        </div>
      )}

      {editingPost && (
        <div className="modal">
          <div className="modal__backdrop" onClick={closeEditPostModal} />
          <div className="modal__dialog" role="dialog" aria-modal="true">
            <form className="modal__form" onSubmit={handleEditPostSubmit}>
              <header className="modal__header">
                <h3>Edit update</h3>
                <button
                  type="button"
                  className="modal__close"
                  onClick={closeEditPostModal}
                  aria-label="Close edit form"
                >
                  X
                </button>
              </header>
              <label>
                Message
                <textarea
                  value={editingPost.message}
                  onChange={handleEditPostChange}
                  rows={4}
                  placeholder="Share what's happening..."
                />
              </label>
              {editError && <p className="modal__error">{editError}</p>}
              <div className="modal__actions">
                <button type="button" className="modal__secondary" onClick={closeEditPostModal}>
                  Cancel
                </button>
                <button type="submit" className="modal__primary" disabled={isSavingEdit}>
                  {isSavingEdit ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
