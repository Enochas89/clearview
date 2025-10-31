import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useWorkspace } from "../../workspace/WorkspaceContext";
import type { DayFile, DayPost } from "../../types";

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const DOCUMENT_ICON_SRC = new URL("../../assets/doc.png", import.meta.url).href;
const PDF_ICON_SRC = new URL("../../assets/pdf.png", import.meta.url).href;
const IMAGE_ICON_SRC = new URL("../../assets/pic.png", import.meta.url).href;

type FeedPost = DayPost & {
  day: string;
};

type LocalComment = {
  id: string;
  author: string;
  message: string;
  createdAt: string;
};

type LikeState = {
  liked: boolean;
  count: number;
};

type FeedItem =
  | {
      kind: "post";
      id: string;
      createdAt: string;
      day: string;
      post: FeedPost;
    }
  | {
      kind: "file";
      id: string;
      createdAt: string;
      day: string;
      file: DayFile;
    };

type PostComposerProps = {
  currentUserName: string;
  message: string;
  error: string | null;
  file: File | null;
  isSubmitting: boolean;
  onMessageChange: (value: string) => void;
  onFileSelect: (file: File | null) => void;
  onSubmit: () => void;
};

type PostCardProps = {
  post: FeedPost;
  currentUserName: string;
  likeState: LikeState;
  comments: LocalComment[];
  commentDraft: string;
  toastMessage?: string | null;
  isDeleting: boolean;
  onToggleLike: (postId: string) => void;
  onDraftChange: (postId: string, value: string) => void;
  onSubmitComment: (postId: string) => void;
  onShare: (post: FeedPost) => void;
  onDelete?: (post: FeedPost) => void;
  onEdit?: (post: FeedPost) => void;
};

type FileCardProps = {
  item: Extract<FeedItem, { kind: "file" }>;
};

const newComment = (author: string, message: string): LocalComment => {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    author,
    message,
    createdAt: new Date().toISOString(),
  };
};

const getFileExtension = (fileName: string | undefined | null) => {
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
  const extension = getFileExtension(file.name);
  return ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp", "heic", "heif"].includes(extension);
};

const isPdfFile = (file: Pick<DayFile, "type" | "name">) => {
  if (file.type === "application/pdf") {
    return true;
  }
  return getFileExtension(file.name) === "pdf";
};

const getAttachmentIcon = (file: Pick<DayFile, "type" | "name">) => {
  if (isImageFile(file)) {
    return IMAGE_ICON_SRC;
  }
  if (isPdfFile(file)) {
    return PDF_ICON_SRC;
  }
  return DOCUMENT_ICON_SRC;
};

const formatRelativeTime = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);

  const divisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { amount: 60, unit: "second" },
    { amount: 60, unit: "minute" },
    { amount: 24, unit: "hour" },
    { amount: 7, unit: "day" },
    { amount: 4.34524, unit: "week" },
    { amount: 12, unit: "month" },
    { amount: Number.POSITIVE_INFINITY, unit: "year" },
  ];

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  let duration = diffSeconds;
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return "";
};

const computeSeedLikeCount = (postId: string) => {
  let code = 0;
  for (let index = 0; index < postId.length; index += 1) {
    code += postId.charCodeAt(index) * (index + 1);
  }
  return (code % 19) + 3;
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

const PostComposer = ({
  currentUserName,
  message,
  error,
  file,
  isSubmitting,
  onMessageChange,
  onFileSelect,
  onSubmit,
}: PostComposerProps) => {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    onFileSelect(selectedFile);
  };

  return (
    <section className="social-composer" aria-label="Create a post">
      <header className="social-composer__header">
        <div className="social-composer__avatar" aria-hidden="true">
          {currentUserName.charAt(0).toUpperCase()}
        </div>
        <div>
          <h2>{currentUserName}</h2>
          <p>Share updates, wins, or questions with your crew.</p>
        </div>
      </header>
      <form
        className="social-composer__form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <textarea
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          placeholder="What's happening with the project today?"
          rows={4}
          aria-label="Post message"
        />
        {file && (
          <div className="social-composer__attachment">
            <span>{file.name}</span>
            <button
              type="button"
              onClick={() => onFileSelect(null)}
              aria-label="Remove attachment"
            >
              Remove
            </button>
          </div>
        )}
        {error && <p className="social-composer__error">{error}</p>}
        <footer className="social-composer__footer">
          <label className="social-composer__upload">
            <input
              type="file"
              onChange={handleFileChange}
              accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
            />
            <span>Attach file</span>
          </label>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Posting..." : "Post update"}
          </button>
        </footer>
      </form>
    </section>
  );
};

const PostCard = ({
  post,
  currentUserName,
  likeState,
  comments,
  commentDraft,
  toastMessage,
  isDeleting,
  onToggleLike,
  onDraftChange,
  onSubmitComment,
  onShare,
  onDelete,
  onEdit,
}: PostCardProps) => {
  const formattedTime = formatRelativeTime(post.createdAt || post.day);
  const absoluteTime = new Date(post.createdAt || post.day).toLocaleString();

  const handleShareClick = () => {
    onShare(post);
  };

  const handleDeleteClick = () => {
    if (onDelete) {
      onDelete(post);
    }
  };

  const handleEditClick = () => {
    if (onEdit) {
      onEdit(post);
    }
  };

  const author = post.authorName || "Teammate";
  const authorInitial = author.charAt(0).toUpperCase();

  return (
    <article className="social-feed__card" id={`post-${post.id}`}>
      <header className="social-feed__meta">
        <div className="social-feed__avatar" aria-hidden="true">
          {authorInitial}
        </div>
        <div className="social-feed__author">
          <span className="social-feed__author-name">{author}</span>
          <time dateTime={post.createdAt} title={absoluteTime}>
            {formattedTime || absoluteTime}
          </time>
        </div>
        {(onEdit || onDelete) && (
          <div className="social-feed__meta-actions">
            {onEdit && (
              <button
                type="button"
                className="social-feed__edit"
                onClick={handleEditClick}
                aria-label="Edit post"
              >
                Edit
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="social-feed__delete"
                onClick={handleDeleteClick}
                disabled={isDeleting}
                aria-label="Delete post"
              >
                {isDeleting ? "Deleting..." : "Remove"}
              </button>
            )}
          </div>
        )}
      </header>
      <div className="social-feed__body">
        {post.message.split(/\n+/).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
        {post.attachments.length > 0 && (
          <div className="social-feed__attachments">
            {post.attachments.map((attachment) => {
              const isImage = isImageFile(attachment);
              return (
                <a
                  key={attachment.id}
                  className={`social-feed__attachment${isImage ? " is-image" : ""}`}
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {isImage ? (
                    <img src={attachment.url} alt={attachment.name} loading="lazy" />
                  ) : (
                    <>
                      <img
                        src={getAttachmentIcon(attachment)}
                        alt=""
                        aria-hidden="true"
                      />
                      <span>{attachment.name}</span>
                    </>
                  )}
                </a>
              );
            })}
          </div>
        )}
      </div>
      <footer className="social-feed__footer">
        <div className="social-feed__actions">
          <button
            type="button"
            className={`social-feed__action${likeState.liked ? " is-active" : ""}`}
            onClick={() => onToggleLike(post.id)}
            aria-pressed={likeState.liked}
          >
            ❤️ {likeState.count}
          </button>
          <button
            type="button"
            className="social-feed__action"
            onClick={() => {
              if (typeof document !== "undefined") {
                const input = document.getElementById(
                  `comment-input-${post.id}`,
                ) as HTMLInputElement | null;
                if (input) {
                  input.focus();
                }
              }
            }}
          >
            💬 {comments.length}
          </button>
          <button type="button" className="social-feed__action" onClick={handleShareClick}>
            🔗 Share
          </button>
        </div>
        {toastMessage && <p className="social-feed__toast">{toastMessage}</p>}
        <div className="social-feed__comments">
          {comments.map((comment) => (
            <div key={comment.id} className="social-comment">
              <div className="social-comment__avatar" aria-hidden="true">
                {comment.author.charAt(0).toUpperCase()}
              </div>
              <div className="social-comment__bubble">
                <div className="social-comment__meta">
                  <span>{comment.author}</span>
                  <time dateTime={comment.createdAt}>{formatRelativeTime(comment.createdAt)}</time>
                </div>
                <p>{comment.message}</p>
              </div>
            </div>
          ))}
          <div className="social-comment__form">
            <div className="social-comment__avatar" aria-hidden="true">
              {currentUserName.charAt(0).toUpperCase()}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitComment(post.id);
              }}
            >
              <input
                type="text"
                placeholder="Write a comment..."
                value={commentDraft}
                onChange={(event) => onDraftChange(post.id, event.target.value)}
                aria-label="Add a comment"
                id={`comment-input-${post.id}`}
              />
              <button type="submit" disabled={!commentDraft.trim()}>
                Reply
              </button>
            </form>
          </div>
        </div>
      </footer>
    </article>
  );
};

const FileCard = ({ item }: FileCardProps) => {
  const { file, day } = item;
  const formattedTime = formatRelativeTime(file.addedAt || day);
  const absoluteTime = new Date(file.addedAt || day).toLocaleString();
  const uploader = file.uploadedByName || "File upload";
  const isImage = isImageFile(file);

  return (
    <article className="social-feed__card" id={`file-${file.id}`}>
      <header className="social-feed__meta">
        <div className="social-feed__avatar" aria-hidden="true">
          📎
        </div>
        <div className="social-feed__author">
          <span className="social-feed__author-name">{uploader}</span>
          <time dateTime={file.addedAt || day} title={absoluteTime}>
            {formattedTime || absoluteTime}
          </time>
        </div>
      </header>
      <div className="social-feed__body">
        <div className="social-feed__attachments">
          <a
            className={`social-feed__attachment${isImage ? " is-image" : ""}`}
            href={file.url}
            target="_blank"
            rel="noreferrer"
          >
            {isImage ? (
              <img src={file.url} alt={file.name} loading="lazy" />
            ) : (
              <>
                <img src={getAttachmentIcon(file)} alt="" aria-hidden="true" />
                <span>{file.name}</span>
              </>
            )}
          </a>
        </div>
      </div>
      <footer className="social-feed__footer">
        <div className="social-feed__actions">
          <span className="social-feed__action" aria-hidden="true">
            📁 {formatFileSize(file.size)}
          </span>
        </div>
      </footer>
    </article>
  );
};

const TimelineView = () => {
  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    projectDayEntries,
    handleCreatePost,
    handleDeletePost,
    handleUpdatePost,
    session,
  } = useWorkspace();

  const [composerMessage, setComposerMessage] = useState("");
  const [composerFile, setComposerFile] = useState<File | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [likes, setLikes] = useState<Record<string, LikeState>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, LocalComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ postId?: string; message: string } | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<{
    id: string;
    message: string;
    originalMessage: string;
  } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    if (!toast) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const timer = window.setTimeout(() => {
      setToast(null);
    }, 4000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  const closeComposer = useCallback(() => {
    setIsComposerOpen(false);
  }, []);

  const openComposer = useCallback(() => {
    setComposerError(null);
    setIsComposerOpen(true);
  }, []);

  useEffect(() => {
    if (!isComposerOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeComposer();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isComposerOpen, closeComposer]);

  const closeEditModal = useCallback(
    (options?: { force?: boolean }) => {
      if (isSavingEdit && !options?.force) {
        return;
      }
      setEditingPost(null);
      setEditError(null);
      setIsSavingEdit(false);
    },
    [isSavingEdit],
  );

  const openEditModal = useCallback((post: FeedPost) => {
    setEditingPost({
      id: post.id,
      message: post.message,
      originalMessage: post.message,
    });
    setEditError(null);
    setIsSavingEdit(false);
  }, []);

  const handleEditChange = useCallback(
    (value: string) => {
      setEditingPost((prev) => (prev ? { ...prev, message: value } : prev));
      if (editError && value.trim().length > 0) {
        setEditError(null);
      }
    },
    [editError],
  );

  const handleEditFormSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editingPost) {
        return;
      }
      const trimmed = editingPost.message.trim();
      if (!trimmed) {
        setEditError("Share an update before saving.");
        return;
      }
      if (trimmed === editingPost.originalMessage.trim()) {
        closeEditModal({ force: true });
        return;
      }
      setIsSavingEdit(true);
      try {
        await handleUpdatePost(editingPost.id, trimmed);
        setToast({ postId: editingPost.id, message: "Post updated." });
        closeEditModal({ force: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to update post.";
        setEditError(message);
      } finally {
        setIsSavingEdit(false);
      }
    },
    [editingPost, handleUpdatePost, closeEditModal, setToast],
  );

  useEffect(() => {
    if (!editingPost) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editingPost, closeEditModal]);

  const currentUserName =
    session?.user?.user_metadata?.full_name?.trim() ||
    session?.user?.email ||
    "You";

  const topics = useMemo(() => {
    const highlighted = projects
      .map((project) => project.name)
      .filter(Boolean)
      .slice(0, 5) as string[];
    return highlighted.length > 0
      ? highlighted
      : ["Progress", "Announcements", "Highlights", "Team Wins"];
  }, [projects]);

  const dayEntries = useMemo(() => {
    if (!selectedProjectId) {
      return [];
    }
    return projectDayEntries.get(selectedProjectId) ?? [];
  }, [projectDayEntries, selectedProjectId]);

  const feedItems = useMemo(() => {
    const items: FeedItem[] = [];
    dayEntries.forEach((entry) => {
      entry.posts.forEach((post) => {
        items.push({
          kind: "post",
          id: `post-${post.id}`,
          createdAt: post.createdAt || entry.date,
          day: entry.date,
          post: {
            ...post,
            day: entry.date,
          },
        });
      });
      entry.files.forEach((file) => {
        items.push({
          kind: "file",
          id: `file-${file.id}`,
          createdAt: file.addedAt || entry.date,
          day: entry.date,
          file,
        });
      });
    });
    return items.sort((a, b) => {
      const aDate = new Date(a.createdAt || a.day).getTime();
      const bDate = new Date(b.createdAt || b.day).getTime();
      return bDate - aDate;
    });
  }, [dayEntries]);

  const likeForPost = useCallback(
    (postId: string): LikeState => likes[postId] ?? { liked: false, count: computeSeedLikeCount(postId) },
    [likes],
  );

  const handleLikeToggle = useCallback((postId: string) => {
    setLikes((prev) => {
      const current = prev[postId] ?? { liked: false, count: computeSeedLikeCount(postId) };
      const nextLiked = !current.liked;
      const nextCount = Math.max(0, current.count + (nextLiked ? 1 : -1));
      return {
        ...prev,
        [postId]: {
          liked: nextLiked,
          count: nextCount,
        },
      };
    });
  }, []);

  const handleCommentDraftChange = useCallback((postId: string, value: string) => {
    setCommentDrafts((prev) => ({
      ...prev,
      [postId]: value,
    }));
  }, []);

  const handleCommentSubmit = useCallback(
    (postId: string) => {
      const draft = commentDrafts[postId]?.trim();
      if (!draft) {
        return;
      }
      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] ?? []), newComment(currentUserName, draft)],
      }));
      setCommentDrafts((prev) => ({
        ...prev,
        [postId]: "",
      }));
    },
    [commentDrafts, currentUserName],
  );

  const handleShare = useCallback(async (post: FeedPost) => {
    if (typeof window === "undefined") {
      setToast({ postId: post.id, message: "Sharing is only available in the app." });
      return;
    }

    const shareUrl = `${window.location.origin}${window.location.pathname}#post-${post.id}`;
    const payload = {
      title: "Clear View Teams update",
      text: post.message,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(payload);
        setToast({ postId: post.id, message: "Shared successfully!" });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setToast({ postId: post.id, message: "Link copied to clipboard." });
      } else {
        setToast({ postId: post.id, message: shareUrl });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to share right now.";
      setToast({ postId: post.id, message });
    }
  }, []);

  const handleDelete = useCallback(
    async (post: FeedPost) => {
      setDeletingPostId(post.id);
      try {
        await handleDeletePost(post.id, post.attachments);
        setToast({ postId: post.id, message: "Post removed." });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to delete post.";
        setToast({ postId: post.id, message });
      } finally {
        setDeletingPostId(null);
      }
    },
    [handleDeletePost],
  );

  const handleFileSelect = useCallback((file: File | null) => {
    if (file && file.size > MAX_FILE_BYTES) {
      setComposerError("Attachments are limited to 100 MB.");
      return;
    }
    setComposerError(null);
    setComposerFile(file);
  }, []);

  const handleCreatePostRequest = useCallback(async () => {
    const trimmed = composerMessage.trim();
    if (!trimmed && !composerFile) {
      setComposerError("Share a quick update or attach a file to post.");
      return;
    }

    setComposerError(null);
    setIsPosting(true);
    try {
      await handleCreatePost({
        message: trimmed,
        file: composerFile ?? undefined,
      });
      setComposerMessage("");
      setComposerFile(null);
      setToast({ message: "Update shared with the team!" });
      setIsComposerOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create post.";
      setComposerError(message);
    } finally {
      setIsPosting(false);
    }
  }, [composerFile, composerMessage, handleCreatePost]);

  if (projects.length === 0) {
    return (
      <section className="social-feed">
        <div className="social-feed__empty">
          <h2>Bring your team together</h2>
          <p>Create a project from the sidebar to start collaborating.</p>
        </div>
      </section>
    );
  }

  if (!selectedProjectId) {
    return (
      <section className="social-feed">
        <div className="social-feed__empty">
          <h2>Select a project to continue</h2>
          <p>Choose a project from the sidebar to open its social feed.</p>
          <button
            type="button"
            onClick={() => {
              if (projects[0]) {
                setSelectedProjectId(projects[0].id);
              }
            }}
          >
            Go to first project
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="social-feed">
      <header className="social-feed__header">
        <h1>Project feed</h1>
        <div className="social-feed__topics">
          {topics.map((topic) => (
            <span key={topic} className="social-feed__topic">
              #{topic.replace(/\s+/g, "")}
            </span>
          ))}
        </div>
      </header>

      {toast && <div className="social-feed__notice">{toast.message}</div>}

      <div className="social-feed__stream">
        {feedItems.length === 0 ? (
          <div className="social-feed__empty">
            <h2>No posts yet</h2>
            <p>Be the first to share what&apos;s happening today.</p>
          </div>
        ) : (
          feedItems.map((item) =>
            item.kind === "post" ? (
              <PostCard
                key={item.id}
                post={item.post}
                currentUserName={currentUserName}
                likeState={likeForPost(item.post.id)}
                comments={commentsByPost[item.post.id] ?? []}
                commentDraft={commentDrafts[item.post.id] ?? ""}
                toastMessage={toast?.postId === item.post.id ? toast.message : null}
                isDeleting={deletingPostId === item.post.id}
                onToggleLike={handleLikeToggle}
                onDraftChange={handleCommentDraftChange}
                onSubmitComment={handleCommentSubmit}
                onShare={handleShare}
                onDelete={
                  !item.post.authorName || item.post.authorName === currentUserName
                    ? handleDelete
                    : undefined
                }
                onEdit={
                  !item.post.authorName || item.post.authorName === currentUserName
                    ? openEditModal
                    : undefined
                }
              />
            ) : (
              <FileCard key={item.id} item={item} />
            ),
          )
        )}
      </div>

      <button
        type="button"
        className="social-compose-fab"
        onClick={openComposer}
        aria-label="Compose a new update"
      >
        <span aria-hidden="true">+</span>
      </button>

      {isComposerOpen && (
        <div className="social-compose-modal">
          <div
            className="social-compose-backdrop"
            role="presentation"
            onClick={closeComposer}
          />
          <div className="social-compose-dialog" role="dialog" aria-modal="true" aria-label="Create a project update">
            <header className="social-compose-dialog__header">
              <h2>New project update</h2>
              <button
                type="button"
                className="social-compose-dialog__close"
                onClick={closeComposer}
                aria-label="Close composer"
              >
                ×
              </button>
            </header>
            <PostComposer
              currentUserName={currentUserName}
              message={composerMessage}
              error={composerError}
              file={composerFile}
              isSubmitting={isPosting}
              onMessageChange={setComposerMessage}
              onFileSelect={handleFileSelect}
              onSubmit={handleCreatePostRequest}
            />
          </div>
        </div>
      )}

      {editingPost && (
        <div className="social-compose-modal">
          <div
            className="social-compose-backdrop"
            role="presentation"
            onClick={() => closeEditModal()}
          />
          <div className="social-compose-dialog" role="dialog" aria-modal="true" aria-label="Edit project update">
            <header className="social-compose-dialog__header">
              <h2>Edit post</h2>
              <button
                type="button"
                className="social-compose-dialog__close"
                onClick={() => closeEditModal()}
                aria-label="Close edit dialog"
                disabled={isSavingEdit}
              >
                ×
              </button>
            </header>
            <form className="social-edit-form" onSubmit={handleEditFormSubmit}>
              <textarea
                value={editingPost.message}
                onChange={(event) => handleEditChange(event.target.value)}
                placeholder="Update your post"
                disabled={isSavingEdit}
                autoFocus
              />
              {editError && <p className="social-composer__error">{editError}</p>}
              <div className="social-edit-form__footer">
                <button
                  type="button"
                  className="social-edit-cancel"
                  onClick={() => closeEditModal()}
                  disabled={isSavingEdit}
                >
                  Cancel
                </button>
                <button type="submit" className="social-edit-save" disabled={isSavingEdit}>
                  {isSavingEdit ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default TimelineView;
