import { ChangeEvent, useCallback, useId, useState, useRef, useEffect } from "react";
import { DayEntry, DayNote, DayFile, MemberRole } from "../types";
import docLogo from "../assets/doclogo.png";
import pdfLogo from "../assets/pdflogo.png";
import picLogo from "../assets/piclogo.png";

type CalendarViewProps = {
  days: DayEntry[];
  selectedProjectId: string | null;
  selectedDay: string | null;
  currentUserId: string;
  currentUserRole: MemberRole;
  memberDirectory: Record<string, string>;
  onAddFile: (date: string, file: File) => Promise<void> | void;
  onRemoveFile: (date: string, fileId: string) => void;
  onCreateNote: (note: Omit<DayNote, "id" | "createdAt" | "userId">) => void;
  onUpdateNote: (noteId: string, text: string) => void;
  onDeleteNote: (noteId: string) => void;
  onSelectDay: (date: string) => void;
};

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const NOTE_DRAFTS_STORAGE_KEY = "clearview:calendar:noteDrafts";

const isMobile = () => /Mobi/i.test(navigator.userAgent);

const parseISODate = (isoDate: string) => {
  if (!isoDate) {
    return null;
  }
  const [datePart] = isoDate.split("T");
  const [year, month, day] = (datePart ?? "").split("-").map((value) => Number.parseInt(value, 10));
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    return null;
  }
  return new Date(year, month - 1, day);
};

const formatDayLabel = (isoDate: string) => {
  const date = parseISODate(isoDate);
  if (!date) {
    return isoDate;
  }
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

const formatTimestampLabel = (isoDateTime: string) => {
  if (!isoDateTime) {
    return "";
  }
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  if (date.getFullYear() !== now.getFullYear()) {
    options.year = "numeric";
  }
  return date.toLocaleString(undefined, options);
};

const formatTimeLabel = (isoDateTime: string) => {
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

const truncate = (text: string, length: number) => {
  if (text.length <= length) {
    return text;
  }
  return text.substring(0, length) + "...";
};

const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "svg"]);
const documentExtensions = new Set(["doc", "docx", "rtf", "txt", "odt"]);
const documentMimeTypes = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/plain",
  "application/vnd.oasis.opendocument.text",
]);

const isImageFile = (file: DayFile) => {
  const extension = file.name.split(".")?.pop()?.toLowerCase() ?? "";
  const mime = file.type?.toLowerCase?.() ?? "";
  return mime.startsWith("image/") || imageExtensions.has(extension);
};

const getFileIcon = (file: DayFile) => {
  const extension = file.name.split(".")?.pop()?.toLowerCase() ?? "";
  const mime = file.type?.toLowerCase?.() ?? "";

  if (mime === "application/pdf" || extension === "pdf") {
    return pdfLogo;
  }

  if (isImageFile(file)) {
    return picLogo;
  }

  if (documentMimeTypes.has(mime) || documentExtensions.has(extension)) {
    return docLogo;
  }

  return docLogo;
};

const readNoteDraftsFromSession = (): Map<string, string> => {
  if (typeof window === "undefined") {
    return new Map();
  }
  try {
    const raw = window.sessionStorage.getItem(NOTE_DRAFTS_STORAGE_KEY);
    if (raw) {
      return new Map(JSON.parse(raw));
    }
  } catch {
    // Ignore storage read failures.
  }
  return new Map();
};

const CalendarView = ({
  days,
  selectedProjectId,
  selectedDay,
  currentUserId,
  currentUserRole,
  memberDirectory,
  onAddFile,
  onRemoveFile,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onSelectDay,
}: CalendarViewProps) => {
  const inputIdPrefix = useId();
  const [activeNote, setActiveNote] = useState<DayNote | null>(null);
  const [editingNote, setEditingNote] = useState<DayNote | null>(null);
  const [editedText, setEditedText] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Map<string, string>>(readNoteDraftsFromSession());
  const [previewFile, setPreviewFile] = useState<DayFile | null>(null);
  const noteViewerRef = useRef<HTMLDivElement | null>(null);
  const previewDialogRef = useRef<HTMLDivElement | null>(null);
  const renameDialogRef = useRef<HTMLDivElement | null>(null);
  const instructionsDialogRef = useRef<HTMLDivElement | null>(null);
  const scrollDialogIntoView = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return;
    }

    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
  }, []);
  const resolveMemberLabel = useCallback(
    (userId?: string | null) => {
      if (!userId) {
        return "Unknown team member";
      }
      if (userId === currentUserId) {
        const currentLabel = memberDirectory[userId];
        if (currentLabel && currentLabel.trim().length > 0) {
          return `${currentLabel} (You)`;
        }
        return "You";
      }
      const label = memberDirectory[userId];
      if (label && label.trim().length > 0) {
        return label;
      }
      return `Member ${userId.slice(0, 6)}`;
    },
    [memberDirectory, currentUserId]
  );
  const [pendingUpload, setPendingUpload] = useState<{
    date: string;
    file: File;
    baseName: string;
    extension: string;
  } | null>(null);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const isViewer = currentUserRole === "viewer";

  const canManageFile = useCallback(
    (file: DayFile) => {
      if (currentUserRole !== "viewer") {
        return true;
      }

      return Boolean(file.uploadedBy) && file.uploadedBy === currentUserId;
    },
    [currentUserRole, currentUserId]
  );

  const canManageNote = useCallback(
    (note: DayNote) => {
      if (currentUserRole !== "viewer") {
        return true;
      }
      return note.userId === currentUserId;
    },
    [currentUserRole, currentUserId]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.sessionStorage.setItem(NOTE_DRAFTS_STORAGE_KEY, JSON.stringify(Array.from(noteDrafts.entries())));
    } catch {
      // Ignore storage write failures.
    }
  }, [noteDrafts]);

  useEffect(() => {
    setNoteDrafts(readNoteDraftsFromSession());
  }, []);

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
    setIsUploading(false);
  };

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setPendingUpload((prev) => (prev ? { ...prev, baseName: value } : prev));
  };

  const handleUploadConfirm = async () => {
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
      setIsUploading(true);
      await Promise.resolve(onAddFile(pendingUpload.date, fileToUpload));
      setPendingUpload(null);
    } catch (error) {
      console.error("Failed to upload file:", error);
      alert("We couldn't upload that file. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFileClick = useCallback(
    (date: string, file: DayFile) => {
      if (isViewer || !canManageFile(file)) {
        return;
      }
      onRemoveFile(date, file.id);
    },
    [canManageFile, isViewer, onRemoveFile]
  );

  const handleDeleteNoteClick = useCallback(
    (note: DayNote) => {
      if (isViewer || !canManageNote(note)) {
        return;
      }
      onDeleteNote(note.id);
      setActiveNote((current) => (current?.id === note.id ? null : current));
      setEditingNote((current) => (current?.id === note.id ? null : current));
    },
    [canManageNote, isViewer, onDeleteNote]
  );

  const beginEditingNote = useCallback(
    (note: DayNote) => {
      if (isViewer || !canManageNote(note)) {
        return;
      }
      setEditingNote(note);
      setEditedText(note.text);
    },
    [canManageNote, isViewer]
  );

  const handleSaveEditedNote = useCallback(() => {
    if (!activeNote) {
      return;
    }

    if (isViewer || !canManageNote(activeNote)) {
      return;
    }

    onUpdateNote(activeNote.id, editedText);
    setEditingNote(null);
    setActiveNote(null);
  }, [activeNote, canManageNote, editedText, isViewer, onUpdateNote]);

  useEffect(() => {
    if (!activeNote) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveNote(null);
        setEditingNote(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeNote]);

  useEffect(() => {
    if (!activeNote) {
      return;
    }

    const target = noteViewerRef.current;
    if (!target) {
      return;
    }

    target.focus();
    scrollDialogIntoView(target);
  }, [activeNote, scrollDialogIntoView]);

  useEffect(() => {
    setActiveNote(null);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!activeNote) {
      return;
    }

    const noteStillExists = days.some((day) =>
      day.notes.some((note) => note.id === activeNote.id)
    );

    if (!noteStillExists) {
      setActiveNote(null);
    }
  }, [days, activeNote]);

  useEffect(() => {
    if (!previewFile) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewFile(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewFile]);

  useEffect(() => {
    if (!previewFile) {
      return;
    }

    const target = previewDialogRef.current;
    if (!target) {
      return;
    }

    target.focus();
    scrollDialogIntoView(target);
  }, [previewFile, scrollDialogIntoView]);

  useEffect(() => {
    if (!previewFile) {
      return;
    }

    const fileStillExists = days.some((day) =>
      day.files.some((file) => file.id === previewFile.id)
    );

    if (!fileStillExists) {
      setPreviewFile(null);
    }
  }, [days, previewFile]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasAutoScrolledRef = useRef(false);
  const [todayDate] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      const { deltaX, deltaY } = event;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX === 0) {
          return;
        }

        event.preventDefault();
        scroller.scrollLeft += deltaX;
        return;
      }

      if (deltaY === 0) {
        return;
      }

      const composedPath = typeof event.composedPath === "function" ? event.composedPath() : [event.target as EventTarget];
      for (const node of composedPath) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }

        if (node === scroller) {
          break;
        }

        const style = window.getComputedStyle(node);
        const allowsScroll = ["auto", "scroll", "overlay"].some((value) => style.overflowY === value || style.overflow === value);
        if (!allowsScroll) {
          continue;
        }

        if (node.scrollHeight <= node.clientHeight) {
          continue;
        }

        if (deltaY < 0 && node.scrollTop > 0) {
          return;
        }

        if (deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight) {
          return;
        }
      }

      event.preventDefault();
      scroller.scrollLeft += deltaY;
    };

    scroller.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      scroller.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const noteViewerId = `${inputIdPrefix}-note-dialog`;
  const noteViewerHeadingId = `${noteViewerId}-title`;
  const noteViewerBodyId = `${noteViewerId}-body`;
  const previewDialogId = `${inputIdPrefix}-image-preview`;
  const previewHeadingId = `${previewDialogId}-title`;
  const previewBodyId = `${previewDialogId}-body`;
  const renameDialogTitleId = `${inputIdPrefix}-rename-title`;
  const dayPickerId = `${inputIdPrefix}-day-picker`;
  const mobileTimelineEnabled = isMobile();

  const scrollToDay = useCallback(
    (date: string) => {
      const target = tileRefs.current[date];
      if (!target) {
        return;
      }

      target.scrollIntoView({
        behavior: "smooth",
        block: mobileTimelineEnabled ? "start" : "nearest",
        inline: "center",
      });
    },
    [mobileTimelineEnabled]
  );

  const handleDayPickerChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      if (!value) {
        return;
      }
      onSelectDay(value);
    },
    [onSelectDay]
  );

  useEffect(() => {
    if (!selectedDay) {
      return;
    }
    scrollToDay(selectedDay);
  }, [selectedDay, scrollToDay]);

  const activeNoteDayLabel = activeNote ? formatDayLabel(activeNote.date) : "";
  const activeNoteTimestampFull = activeNote
    ? (() => {
        const createdAtDate = new Date(activeNote.createdAt);
        if (Number.isNaN(createdAtDate.getTime())) {
          return null;
        }
        return createdAtDate.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        });
      })()
    : null;
  const activeNoteAuthorLabel = activeNote ? resolveMemberLabel(activeNote.userId) : null;
  const activeNoteMetaLabel =
    activeNoteAuthorLabel && activeNoteTimestampFull
      ? `Added by ${activeNoteAuthorLabel} on ${activeNoteTimestampFull}`
      : activeNoteAuthorLabel
        ? `Added by ${activeNoteAuthorLabel}`
        : activeNoteTimestampFull
          ? `Added on ${activeNoteTimestampFull}`
          : null;
  const previewMetaLabel = previewFile
    ? [
        formatFileSize(previewFile.size),
        resolveMemberLabel(previewFile.uploadedBy),
        formatTimestampLabel(previewFile.addedAt),
      ]
        .filter(Boolean)
        .join(" | ")
    : "";

  const todayTileExists = days.some((day) => day.date === todayDate);

  const scrollToToday = useCallback(() => {
    onSelectDay(todayDate);
  }, [onSelectDay, todayDate]);

  useEffect(() => {
    if (hasAutoScrolledRef.current) {
      return;
    }
    const target = tileRefs.current[todayDate];
    if (!todayTileExists || !target) {
      return;
    }

    scrollToToday();
    hasAutoScrolledRef.current = true;
  }, [todayTileExists, scrollToToday, todayDate]);

  useEffect(() => {
    if (!pendingUpload) {
      return;
    }

    const target = renameDialogRef.current;
    if (!target) {
      return;
    }

    scrollDialogIntoView(target);
  }, [pendingUpload, scrollDialogIntoView]);

  useEffect(() => {
    if (!isInstructionsOpen) {
      return;
    }

    const target = instructionsDialogRef.current;
    if (!target) {
      return;
    }

    scrollDialogIntoView(target);
  }, [isInstructionsOpen, scrollDialogIntoView]);

  return (
    <>
    <section className="calendar">
      <div className="calendar__header">
        <div>
          <h2>Daily files</h2>
          <p>Upload and track daily files and logs.</p>
        </div>
        <div className="calendar__header-controls">
          {!mobileTimelineEnabled && days.length > 0 && selectedDay && (
            <label className="calendar__day-picker" htmlFor={dayPickerId}>
              <span className="calendar__day-picker-label">Jump to day</span>
              <select
                id={dayPickerId}
                className="calendar__day-select"
                value={selectedDay ?? (days[0]?.date ?? "")}
                onChange={handleDayPickerChange}
              >
                {days.map((day) => (
                  <option key={`day-option-${day.date}`} value={day.date}>
                    {formatDayLabel(day.date)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="calendar__header-actions">
            <button
              type="button"
              className="calendar__today-button"
              onClick={scrollToToday}
              disabled={!todayTileExists}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setIsInstructionsOpen(true)}
              className="calendar__help-button"
              aria-label="Open calendar instructions"
            >
              Help
            </button>
          </div>
        </div>
      </div>
      <div className={`calendar__body${mobileTimelineEnabled ? " calendar__body--feed" : ""}`}>
        <div className="calendar__scroller" ref={scrollerRef}>
          {days.map((day, index) => {
            const isToday = day.date === todayDate;
            const uploadsLabel = `${day.files.length} upload${day.files.length === 1 ? "" : "s"}`;
            const notesLabel = `${day.notes.length} note${day.notes.length === 1 ? "" : "s"}`;

            const tileBody = (
              <>
                <header className="calendar__tile-header">
                  <div className="calendar__tile-meta">
                    <div className="calendar__tile-heading">
                      <strong>{formatDayLabel(day.date)}</strong>
                      {isToday && <span className="calendar__tile-badge">Today</span>}
                    </div>
                    <small>{uploadsLabel}</small>
                  </div>
                  {!mobileTimelineEnabled ? (
                    <label className="calendar__upload">
                      <input
                        id={`${inputIdPrefix}-${index}`}
                        type="file"
                        onChange={handleFileInput(day.date)}
                        hidden
                      />
                      <span>+ Add file</span>
                    </label>
                  ) : (
                    <div className="calendar__mobile-uploads">
                      <label
                        className="calendar__upload"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          id={`${inputIdPrefix}-${index}-mobile`}
                          type="file"
                          accept="*/*"
                          onChange={handleFileInput(day.date)}
                          hidden
                        />
                        <span>+ Add File</span>
                      </label>
                      <label
                        className="calendar__upload calendar__upload--camera"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          id={`${inputIdPrefix}-${index}-camera`}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleFileInput(day.date)}
                          hidden
                        />
                        <span>Capture Photo</span>
                      </label>
                    </div>
                  )}
                </header>

                {mobileTimelineEnabled && (
                  <div className="calendar__tile-stats">
                    <span className="calendar__tile-chip">
                      <span aria-hidden="true">📁</span>
                      {uploadsLabel}
                    </span>
                    <span className="calendar__tile-chip">
                      <span aria-hidden="true">📝</span>
                      {notesLabel}
                    </span>
                  </div>
                )}

                <div className="calendar__files">
                  {day.files.map((file) => {
                    const uploaderLabel = resolveMemberLabel(file.uploadedBy);
                    const uploadedTimeLabel = formatTimeLabel(file.addedAt);
                    const fileMetaText = [uploaderLabel, uploadedTimeLabel]
                      .filter(Boolean)
                      .join(" | ");
                    const imagePreview = isImageFile(file);

                    return (
                      <div key={file.id} className="calendar__file">
                        <div className="calendar__file-main">
                          {imagePreview ? (
                            <button
                              type="button"
                              className="calendar__file-thumbnail-button"
                              onClick={() => setPreviewFile(file)}
                              aria-label={`Preview ${file.name}`}
                              title={`Preview ${file.name}`}
                            >
                              <img
                                src={file.url}
                                alt=""
                                className="calendar__file-thumbnail"
                                loading="lazy"
                                decoding="async"
                                aria-hidden="true"
                              />
                            </button>
                          ) : (
                            <img
                              src={getFileIcon(file)}
                              alt=""
                              className="calendar__file-icon"
                              loading="lazy"
                              decoding="async"
                              aria-hidden="true"
                            />
                          )}
                          <div className="calendar__file-meta">
                            <span className="calendar__file-name">{file.name}</span>
                            <small>{formatFileSize(file.size)}</small>
                            {fileMetaText && (
                              <small className="calendar__file-meta-detail">{fileMetaText}</small>
                            )}
                          </div>
                        </div>
                        <div className="calendar__file-actions">
                          <a href={file.url} download={file.name} className="calendar__link">
                            Download
                          </a>
                          {!isViewer && canManageFile(file) && (
                            <button
                              type="button"
                              className="calendar__remove"
                              onClick={() => handleRemoveFileClick(day.date, file)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {day.files.length === 0 && (
                    <div className="calendar__empty">Upload files here to keep the day on track.</div>
                  )}
                </div>
                <div className="calendar__notes">
                  <h4>Notes</h4>
                  <div className="calendar__notes-list">
                    {day.notes.map((note) => {
                      const authorLabel = resolveMemberLabel(note.userId);
                      const timestampLabel = formatTimestampLabel(note.createdAt);
                      const noteMetaText =
                        authorLabel && timestampLabel
                          ? `Added by ${authorLabel} on ${timestampLabel}`
                          : authorLabel
                            ? `Added by ${authorLabel}`
                            : timestampLabel
                              ? `Added on ${timestampLabel}`
                              : "";

                      return (
                        <div key={note.id} className="calendar__note">
                          <div className="calendar__note-content">
                            <button
                              type="button"
                              className="calendar__note-link"
                              onClick={() =>
                                setActiveNote((current) => (current?.id === note.id ? null : note))
                              }
                              aria-haspopup="dialog"
                              aria-expanded={activeNote?.id === note.id}
                              aria-controls={activeNote?.id === note.id ? noteViewerId : undefined}
                              title={note.text}
                            >
                              {truncate(note.text, 24)}
                            </button>
                            {noteMetaText && (
                              <small className="calendar__note-meta">{noteMetaText}</small>
                            )}
                          </div>
                          {!isViewer && canManageNote(note) && (
                            <button
                              type="button"
                              className="calendar__note-delete"
                              onClick={() => handleDeleteNoteClick(note)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = noteDrafts.get(day.date)?.trim();
                      if (text && selectedProjectId) {
                        onCreateNote({ projectId: selectedProjectId, date: day.date, text });
                        const newNoteDrafts = new Map(noteDrafts);
                        newNoteDrafts.delete(day.date);
                        setNoteDrafts(newNoteDrafts);
                      }
                    }}
                  >
                    <textarea
                      name="note-text"
                      placeholder="Add a note..."
                      value={noteDrafts.get(day.date) || ""}
                      onChange={(e) => {
                        const newNoteDrafts = new Map(noteDrafts);
                        newNoteDrafts.set(day.date, e.target.value);
                        setNoteDrafts(newNoteDrafts);
                      }}
                    />
                    <button type="submit">Add</button>
                  </form>
                </div>
              </>
            );

            if (mobileTimelineEnabled) {
              return (
                <div key={day.date} className="calendar__feed-item">
                  <article
                    ref={(node) => {
                      tileRefs.current[day.date] = node;
                    }}
                    className={`calendar__tile${isToday ? " calendar__tile--today" : ""}`}
                    aria-current={isToday ? "date" : undefined}
                  >
                    {tileBody}
                  </article>
                </div>
              );
            }

            return (
              <article
                key={day.date}
                ref={(node) => {
                  tileRefs.current[day.date] = node;
                }}
                className={`calendar__tile${isToday ? " calendar__tile--today" : ""}`}
                aria-current={isToday ? "date" : undefined}
              >
                {tileBody}
              </article>
            );
          })}
        </div>
      </div>
      {pendingUpload && (
        <div className="modal">
          <div className="modal__backdrop" onClick={closeModal} />
          <div className="modal__dialog" ref={renameDialogRef} role="dialog" aria-modal="true">
            <div className="modal__form" role="form" aria-labelledby={renameDialogTitleId}>
              <header className="modal__header">
                <h3 id={renameDialogTitleId}>Rename file</h3>
                <button type="button" className="modal__close" onClick={closeModal} aria-label="Close file rename form">
                  &times;
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
                <button
                  type="button"
                  className="modal__primary"
                  onClick={handleUploadConfirm}
                  disabled={isUploading}
                >
                  Save & upload
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewFile && (
        <div className="calendar__preview">
          <div className="calendar__preview-backdrop" onClick={() => setPreviewFile(null)} />
          <div
            id={previewDialogId}
            ref={previewDialogRef}
            className="calendar__preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={previewHeadingId}
            aria-describedby={previewBodyId}
            tabIndex={-1}
          >
            <header className="calendar__preview-header">
              <h4 id={previewHeadingId}>{previewFile.name}</h4>
              <button
                type="button"
                className="calendar__preview-close"
                onClick={() => setPreviewFile(null)}
                aria-label="Close image preview"
              >
                &times;
              </button>
            </header>
            <div className="calendar__preview-body" id={previewBodyId}>
              <img
                src={previewFile.url}
                alt={previewFile.name}
                className="calendar__preview-image"
                loading="lazy"
                decoding="async"
              />
            </div>
            <footer className="calendar__preview-footer">
              {previewMetaLabel && <small className="calendar__preview-meta">{previewMetaLabel}</small>}
              <div className="calendar__preview-actions">
                <a
                  href={previewFile.url}
                  download={previewFile.name}
                  className="calendar__link"
                >
                  Download image
                </a>
              </div>
            </footer>
          </div>
        </div>
      )}

      {activeNote && (
        <div className="calendar__note-viewer">
          <div className="calendar__note-viewer-backdrop" onClick={() => {
            setActiveNote(null);
            setEditingNote(null);
          }} />
          <div
            id={noteViewerId}
            ref={noteViewerRef}
            className="calendar__note-viewer-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={noteViewerHeadingId}
            aria-describedby={noteViewerBodyId}
            tabIndex={-1}
          >
            <header className="calendar__note-viewer-header">
              <h4 id={noteViewerHeadingId}>Day note</h4>
              <button
                type="button"
                className="calendar__note-viewer-close"
                onClick={() => {
                  setActiveNote(null);
                  setEditingNote(null);
                }}
                aria-label="Close note"
              >
                &times;
              </button>
            </header>
            {activeNoteDayLabel && (
              <p className="calendar__note-viewer-date">{activeNoteDayLabel}</p>
            )}
            <div className="calendar__note-viewer-body" id={noteViewerBodyId}>
              {editingNote?.id === activeNote.id ? (
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={5}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              ) : (
                <p>{activeNote.text}</p>
              )}
            </div>
            {activeNoteMetaLabel && (
              <footer className="calendar__note-viewer-meta">
                <span>{activeNoteMetaLabel}</span>
                <div className="calendar__note-viewer-actions">
                  {editingNote?.id === activeNote.id ? (
                    <>
                      <button
                        type="button"
                        className="calendar__note-viewer-button"
                        onClick={() => setEditingNote(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="calendar__note-viewer-button calendar__note-viewer-button--primary"
                        onClick={handleSaveEditedNote}
                      >
                        Save
                      </button>
                    </>
                  ) : !isViewer && canManageNote(activeNote) ? (
                    <button
                      type="button"
                      className="calendar__note-viewer-button"
                      onClick={() => beginEditingNote(activeNote)}
                    >
                      Edit
                    </button>
                  ) : null}
                </div>
              </footer>
            )}
          </div>
        </div>
      )}
    </section>

      {isInstructionsOpen && (
        <div className="modal">
          <div className="modal__backdrop" onClick={() => setIsInstructionsOpen(false)} />
          <div className="modal__dialog" ref={instructionsDialogRef} role="dialog" aria-modal="true">
            <header className="modal__header">
              <h3>Calendar View Instructions</h3>
              <button type="button" className="modal__close" onClick={() => setIsInstructionsOpen(false)} aria-label="Close instructions">
                &times;
              </button>
            </header>
            <div className="modal__content">
              <p>Here you can manage your daily files and notes for the selected project.</p>
              <ul>
                <li><strong>Add files:</strong> Click the "+ Add file" button on a specific day to upload files.</li>
                <li><strong>Remove files:</strong> Click the "Remove" button next to a file to delete it.</li>
                <li><strong>Add notes:</strong> Use the text area at the bottom of each day's tile to add notes.</li>
                <li><strong>Delete notes:</strong> Click the "Delete" button next to a note to remove it.</li>
                <li><strong>View full note:</strong> Click a note to open it in a popup window.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CalendarView;
