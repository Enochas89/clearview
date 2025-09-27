import { ChangeEvent, FormEvent, useCallback, useId, useState, type WheelEvent, useRef, useEffect } from "react";
import { DayEntry } from "../types";

type CalendarViewProps = {
  days: DayEntry[];
  onAddFile: (date: string, file: File) => void;
  onRemoveFile: (date: string, fileId: string) => void;
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

const CalendarView = ({ days, onAddFile, onRemoveFile }: CalendarViewProps) => {
  const inputIdPrefix = useId();
  const [pendingUpload, setPendingUpload] = useState<{
    date: string;
    file: File;
    baseName: string;
    extension: string;
  } | null>(null);

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

  return (
    <section className="calendar">
      <div className="calendar__header">
        <div>
          <h2>Daily files</h2>
          <p>Upload references, briefs, and assets per day. Scroll to explore the schedule.</p>
        </div>
      </div>
      <div className="calendar__scroller" ref={scrollerRef}>
        {days.map((day, index) => (
          <article key={day.date} className="calendar__tile">
            <header className="calendar__tile-header">
              <div>
                <strong>{formatDayLabel(day.date)}</strong>
                <small>{day.files.length} file{day.files.length === 1 ? "" : "s"}</small>
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
                  <div className="calendar__file-meta">
                    <span className="calendar__file-name">{file.name}</span>
                    <small>{formatFileSize(file.size)}</small>
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
                <div className="calendar__empty">Drop files here to keep the day on track.</div>
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
                  �
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
