import { FormEvent, useEffect, useMemo, useState } from "react";

type ComposerMode = "note" | "photo" | "task";

type NotePayload = {
  date: string;
  text: string;
};

type UploadPayload = {
  date: string;
  file: File;
};

type TaskPayload = {
  name: string;
  description?: string;
  startDate: string;
  dueDate: string;
};

type MobileComposerSheetProps = {
  isOpen: boolean;
  mode: ComposerMode | null;
  onClose: () => void;
  onSubmitNote: (payload: NotePayload) => Promise<void>;
  onUploadFile: (payload: UploadPayload) => Promise<void>;
  onSubmitTask: (payload: TaskPayload) => Promise<void>;
  isSubmitting: boolean;
  error?: string | null;
  projectName?: string | null;
  canManageFiles: boolean;
  canManageTasks: boolean;
  initialNoteText?: string | null;
  initialNoteDate?: string | null;
  initialUploadDate?: string | null;
  initialTaskName?: string | null;
  initialTaskDescription?: string | null;
  initialTaskStartDate?: string | null;
  initialTaskDueDate?: string | null;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const MobileComposerSheet = ({
  isOpen,
  mode,
  onClose,
  onSubmitNote,
  onUploadFile,
  onSubmitTask,
  isSubmitting,
  error,
  projectName,
  canManageFiles,
  canManageTasks,
  initialNoteText,
  initialNoteDate,
  initialUploadDate,
  initialTaskName,
  initialTaskDescription,
  initialTaskStartDate,
  initialTaskDueDate,
}: MobileComposerSheetProps) => {
  const [noteDate, setNoteDate] = useState<string>(todayISO());
  const [noteText, setNoteText] = useState("");
  const [uploadDate, setUploadDate] = useState<string>(todayISO());
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [taskName, setTaskName] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskStartDate, setTaskStartDate] = useState<string>(todayISO());
  const [taskDueDate, setTaskDueDate] = useState<string>(todayISO());

  useEffect(() => {
    if (!isOpen || !mode) {
      setNoteText("");
      setNoteDate(todayISO());
      setUploadDate(todayISO());
      setUploadFile(null);
      setTaskName("");
      setTaskDescription("");
      setTaskStartDate(todayISO());
      setTaskDueDate(todayISO());
      return;
    }

    const today = todayISO();

    if (mode === "note") {
      setNoteDate(initialNoteDate && initialNoteDate.length > 0 ? initialNoteDate : today);
      setNoteText(initialNoteText ?? "");
    } else {
      setNoteText("");
      setNoteDate(today);
    }

    if (mode === "photo") {
      setUploadDate(initialUploadDate && initialUploadDate.length > 0 ? initialUploadDate : today);
      setUploadFile(null);
    } else {
      setUploadDate(today);
      setUploadFile(null);
    }

    if (mode === "task") {
      setTaskName(initialTaskName ?? "");
      setTaskDescription(initialTaskDescription ?? "");
      setTaskStartDate(initialTaskStartDate && initialTaskStartDate.length > 0 ? initialTaskStartDate : today);
      setTaskDueDate(initialTaskDueDate && initialTaskDueDate.length > 0 ? initialTaskDueDate : today);
    } else {
      setTaskName("");
      setTaskDescription("");
      setTaskStartDate(today);
      setTaskDueDate(today);
    }
  }, [
    initialNoteDate,
    initialNoteText,
    initialTaskDescription,
    initialTaskDueDate,
    initialTaskName,
    initialTaskStartDate,
    initialUploadDate,
    isOpen,
    mode,
  ]);

  const heading = useMemo(() => {
    if (!mode) {
      return "Quick action";
    }
    if (mode === "note") {
      return "Share an update";
    }
    if (mode === "photo") {
      return "Upload site photo";
    }
    return "Create a task";
  }, [mode]);

  if (!isOpen || !mode) {
    return null;
  }

  const disabledNotice = !projectName ? "Select a project to continue." : null;

  const handleNoteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmitNote({ date: noteDate, text: noteText });
  };

  const handleUploadSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uploadFile) {
      return;
    }
    await onUploadFile({ date: uploadDate, file: uploadFile });
  };

  const handleTaskSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmitTask({
      name: taskName,
      description: taskDescription,
      startDate: taskStartDate,
      dueDate: taskDueDate,
    });
  };

  return (
    <div className="composer-sheet" role="dialog" aria-modal="true">
      <div className="composer-sheet__backdrop" onClick={onClose} />
      <div className="composer-sheet__panel">
        <header className="composer-sheet__header">
          <div>
            <p className="composer-sheet__label">
              {projectName ? projectName : "No project selected"}
            </p>
            <h2>{heading}</h2>
          </div>
          <button type="button" className="composer-sheet__close" onClick={onClose} aria-label="Close composer">
            &times;
          </button>
        </header>

        {disabledNotice ? (
          <p className="composer-sheet__notice">{disabledNotice}</p>
        ) : null}

        {error ? <p className="composer-sheet__error">{error}</p> : null}

        {mode === "note" ? (
          <form className="composer-sheet__form" onSubmit={handleNoteSubmit}>
            <label className="composer-sheet__field">
              <span>Date</span>
              <input
                type="date"
                value={noteDate}
                onChange={(event) => setNoteDate(event.target.value)}
                required
              />
            </label>
            <label className="composer-sheet__field">
              <span>Update</span>
              <textarea
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="Share progress or blockers..."
                rows={4}
                required
              />
            </label>
            <footer className="composer-sheet__actions">
              <button type="button" onClick={onClose} className="composer-sheet__button">
                Cancel
              </button>
              <button
                type="submit"
                className="composer-sheet__button composer-sheet__button--primary"
                disabled={isSubmitting || !noteText.trim() || Boolean(disabledNotice)}
              >
                {isSubmitting ? "Posting…" : "Post update"}
              </button>
            </footer>
          </form>
        ) : null}

        {mode === "photo" ? (
          <form className="composer-sheet__form" onSubmit={handleUploadSubmit}>
            <label className="composer-sheet__field">
              <span>Date</span>
              <input
                type="date"
                value={uploadDate}
                onChange={(event) => setUploadDate(event.target.value)}
                required
              />
            </label>
            <label className="composer-sheet__field">
              <span>File</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setUploadFile(file);
                }}
                required
                disabled={!canManageFiles}
              />
            </label>
            {!canManageFiles ? (
              <p className="composer-sheet__notice">
                You need edit access to upload files.
              </p>
            ) : null}
            <footer className="composer-sheet__actions">
              <button type="button" onClick={onClose} className="composer-sheet__button">
                Cancel
              </button>
              <button
                type="submit"
                className="composer-sheet__button composer-sheet__button--primary"
                disabled={isSubmitting || !uploadFile || Boolean(disabledNotice) || !canManageFiles}
              >
                {isSubmitting ? "Uploading…" : "Upload"}
              </button>
            </footer>
          </form>
        ) : null}

        {mode === "task" ? (
          <form className="composer-sheet__form" onSubmit={handleTaskSubmit}>
            <label className="composer-sheet__field">
              <span>Task name</span>
              <input
                type="text"
                value={taskName}
                onChange={(event) => setTaskName(event.target.value)}
                placeholder="Install fixtures"
                required
                disabled={!canManageTasks}
              />
            </label>
            <label className="composer-sheet__field">
              <span>Description</span>
              <textarea
                value={taskDescription}
                onChange={(event) => setTaskDescription(event.target.value)}
                placeholder="Add any extra context..."
                rows={3}
                disabled={!canManageTasks}
              />
            </label>
            <div className="composer-sheet__grid">
              <label className="composer-sheet__field">
                <span>Start</span>
                <input
                  type="date"
                  value={taskStartDate}
                  onChange={(event) => setTaskStartDate(event.target.value)}
                  required
                  disabled={!canManageTasks}
                />
              </label>
              <label className="composer-sheet__field">
                <span>Due</span>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={(event) => setTaskDueDate(event.target.value)}
                  required
                  disabled={!canManageTasks}
                />
              </label>
            </div>
            {!canManageTasks ? (
              <p className="composer-sheet__notice">
                You need edit access to create tasks.
              </p>
            ) : null}
            <footer className="composer-sheet__actions">
              <button type="button" onClick={onClose} className="composer-sheet__button">
                Cancel
              </button>
              <button
                type="submit"
                className="composer-sheet__button composer-sheet__button--primary"
                disabled={
                  isSubmitting ||
                  !taskName.trim() ||
                  Boolean(disabledNotice) ||
                  !canManageTasks
                }
              >
                {isSubmitting ? "Saving…" : "Create task"}
              </button>
            </footer>
          </form>
        ) : null}
      </div>
    </div>
  );
};

export type { ComposerMode };
export default MobileComposerSheet;
