import { ChangeEvent, FormEvent, useCallback, useId, useState, useRef, useEffect } from "react";
import { DayEntry, DayNote, DayFile } from "../types";
import docLogo from "../assets/doclogo.png";
import pdfLogo from "../assets/pdflogo.png";
import picLogo from "../assets/piclogo.png";

type CalendarViewProps = {
  days: DayEntry[];
  selectedProjectId: string | null;
  onAddFile: (date: string, file: File) => void;
  onRemoveFile: (date: string, fileId: string) => void;
  onCreateNote: (note: Omit<DayNote, "id" | "createdAt" | "userId">) => void;
  onUpdateNote: (noteId: string, text: string) => void;
  onDeleteNote: (noteId: string) => void;
};

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const NOTE_DRAFTS_STORAGE_KEY = "clearview:calendar:noteDrafts";

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

const getFileIcon = (file: DayFile) => {
  const extension = file.name.split('.')?.pop()?.toLowerCase() ?? "";
  const mime = file.type?.toLowerCase?.() ?? "";

  if (mime === "application/pdf" || extension === "pdf") {
    return pdfLogo;
  }

  if (mime.startsWith("image/") || imageExtensions.has(extension)) {
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

const CalendarView = ({ days, selectedProjectId, onAddFile, onRemoveFile, onCreateNote, onUpdateNote, onDeleteNote }: CalendarViewProps) => {
  const inputIdPrefix = useId();
  const [activeNote, setActiveNote] = useState<DayNote | null>(null);
  const [editingNote, setEditingNote] = useState<DayNote | null>(null);
  const [editedText, setEditedText] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Map<string, string>>(readNoteDraftsFromSession());
  const noteViewerRef = useRef<HTMLDivElement | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{
    date: string;
    file: File;
    baseName: string;
    extension: string;
  } | null>(null);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);

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
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setNoteDrafts(readNoteDraftsFromSession());
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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
  };

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setPendingUpload((prev) => (prev ? { ...prev, baseName: value } : prev));
  };

  const handleUploadSubmit = (event: FormEvent<HTMLFormElement>) => {
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

    onAddFile(pendingUpload.date, fileToUpload);
    setPendingUpload(null);
  };

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

    noteViewerRef.current?.focus();
  }, [activeNote]);

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

  const scrollerRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});
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

  const activeNoteDayLabel = activeNote ? formatDayLabel(activeNote.date) : "";
  const activeNoteTimestampLabel = activeNote
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

  const todayTileExists = days.some((day) => day.date === todayDate);

  const scrollToToday = useCallback(() => {
    const target = tileRefs.current[todayDate];
    if (!target) {
      return;
    }

    target.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [todayDate]);

  return (
    <>
    <section className="calendar">
      <div className="calendar__header">
        <div>
          <h2>Daily files</h2>
          <p>Upload and track daily files and logs.</p>
        </div>
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
            ?
          </button>
        </div>
      </div>
      <div className="calendar__scroller" ref={scrollerRef}>
        {days.map((day, index) => {
          const isToday = day.date === todayDate;
          return (
            <article
              key={day.date}
              ref={(node) => {
                tileRefs.current[day.date] = node;
              }}
              className={`calendar__tile${isToday ? " calendar__tile--today" : ""}`}
              aria-current={isToday ? "date" : undefined}
            >
              <header className="calendar__tile-header">
                <div className="calendar__tile-meta">
                  <div className="calendar__tile-heading">
                    <strong>{formatDayLabel(day.date)}</strong>
                    {isToday && <span className="calendar__tile-badge">Today</span>}
                  </div>
                  <small>
                    {day.files.length} file{day.files.length === 1 ? "" : "s"}
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
              <div className="calendar__files">
                {day.files.map((file) => (
                  <div key={file.id} className="calendar__file">
                    <div className="calendar__file-main">
                      <img
                        src={getFileIcon(file)}
                        alt=""
                        className="calendar__file-icon"
                        loading="lazy"
                        aria-hidden="true"
                      />
                      <div className="calendar__file-meta">
                        <span className="calendar__file-name">{file.name}</span>
                        <small>{formatFileSize(file.size)}</small>
                      </div>
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
                {day.files.length === 0 && (
                  <div className="calendar__empty">Upload files here to keep the day on track.</div>
                )}
              </div>
              <div className="calendar__notes">
                <h4>Notes</h4>
                <div className="calendar__notes-list">
                  {day.notes.map((note) => (
                    <div key={note.id} className="calendar__note">
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
                      <button
                        type="button"
                        className="calendar__note-delete"
                        onClick={() => onDeleteNote(note.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
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
            </article>
          );
        })}
      </div>
      {pendingUpload && (
        <div className="modal">
          <div className="modal__backdrop" onClick={closeModal} />
          <div className="modal__dialog" role="dialog" aria-modal="true">
            <form className="modal__form" onSubmit={handleUploadSubmit}>
              <header className="modal__header">
                <h3>Rename file</h3>
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
                <button type="submit" className="modal__primary">
                  Save & upload
                </button>
              </div>
            </form>
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
            {activeNoteTimestampLabel && (
              <footer className="calendar__note-viewer-meta">
                <span>{activeNoteTimestampLabel}</span>
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
                        onClick={() => {
                          onUpdateNote(activeNote.id, editedText);
                          setEditingNote(null);
                          setActiveNote(null);
                        }}
                      >
                        Save
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="calendar__note-viewer-button"
                      onClick={() => {
                        setEditingNote(activeNote);
                        setEditedText(activeNote.text);
                      }}
                    >
                      Edit
                    </button>
                  )}
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
          <div className="modal__dialog" role="dialog" aria-modal="true">
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
