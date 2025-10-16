import { useMemo } from "react";
import docLogo from "../assets/doclogo.png";
import pdfLogo from "../assets/pdflogo.png";
import picLogo from "../assets/piclogo.png";
import type { DayFile } from "../types";

type MobileDocsViewProps = {
  files: DayFile[];
  onRemoveFile?: (fileId: string) => void;
  canManageFiles: boolean;
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

const getIcon = (file: DayFile) => {
  const extension = file.name.split(".")?.pop()?.toLowerCase() ?? "";
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

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatSize = (size: number) => {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${size} B`;
};

const MobileDocsView = ({ files, onRemoveFile, canManageFiles }: MobileDocsViewProps) => {
  const groupedFiles = useMemo(() => {
    const byDate = new Map<string, DayFile[]>();

    [...files].forEach((file) => {
      const bucket = byDate.get(file.date);
      if (bucket) {
        bucket.push(file);
      } else {
        byDate.set(file.date, [file]);
      }
    });

    const entries = Array.from(byDate.entries()).sort((a, b) =>
      a[0] > b[0] ? -1 : 1
    );

    return entries;
  }, [files]);

  if (groupedFiles.length === 0) {
    return (
      <section className="mobile-docs">
        <h2 className="mobile-docs__heading">Project docs</h2>
        <p className="mobile-docs__empty">Files you upload in the schedule will appear here.</p>
      </section>
    );
  }

  return (
    <section className="mobile-docs">
      <h2 className="mobile-docs__heading">Project docs</h2>
      <div className="mobile-docs__list">
        {groupedFiles.map(([date, dayFiles]) => (
          <article key={date} className="mobile-docs__group">
            <header className="mobile-docs__group-header">
              <h3>{formatDate(date)}</h3>
              <span>{dayFiles.length} file{dayFiles.length === 1 ? "" : "s"}</span>
            </header>
            <ul className="mobile-docs__file-list">
              {dayFiles.map((file) => (
                <li key={file.id} className="mobile-docs__file">
                  <div className="mobile-docs__meta">
                    <img
                      src={getIcon(file)}
                      alt=""
                      loading="lazy"
                      className="mobile-docs__icon"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="mobile-docs__name">{file.name}</p>
                      <p className="mobile-docs__details">{formatSize(file.size)}</p>
                    </div>
                  </div>
                  <div className="mobile-docs__actions">
                    <a
                      href={file.url}
                      download={file.name}
                      className="mobile-docs__action"
                    >
                      Download
                    </a>
                    {canManageFiles && onRemoveFile && (
                      <button
                        type="button"
                        className="mobile-docs__action mobile-docs__action--danger"
                        onClick={() => onRemoveFile(file.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
};

export default MobileDocsView;
