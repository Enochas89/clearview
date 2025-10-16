import { useMemo } from "react";
import type { DayFile } from "../types";

type MobileDocsGalleryProps = {
  files: DayFile[];
  canManageFiles: boolean;
  onRemoveFile?: (fileId: string) => void;
};

type FileTile = {
  id: string;
  name: string;
  url?: string;
  size: number;
  date: string;
  type: string;
  isImage: boolean;
};

const MobileDocsGallery = ({
  files,
  canManageFiles,
  onRemoveFile,
}: MobileDocsGalleryProps) => {
  const tiles = useMemo<FileTile[]>(() => {
    const entries = files
      .map<FileTile>((file) => {
        const mime = file.type?.toLowerCase() ?? "";
        const isImage = mime.startsWith("image/");
        return {
          id: file.id,
          name: file.name,
          url: file.url,
          size: file.size,
          date: file.addedAt ?? file.date,
          type: mime,
          isImage,
        };
      })
      .sort((a, b) => {
        const timeA = Date.parse(a.date);
        const timeB = Date.parse(b.date);
        if (Number.isNaN(timeA) && Number.isNaN(timeB)) {
          return 0;
        }
        if (Number.isNaN(timeA)) {
          return 1;
        }
        if (Number.isNaN(timeB)) {
          return -1;
        }
        return timeB - timeA;
      });
    return entries;
  }, [files]);

  return (
    <section className="mobile-docs-gallery">
      <header className="mobile-docs-gallery__header">
        <h2>Files &amp; Docs</h2>
        <p>Swipe through site photos and share project files in one place.</p>
      </header>
      {tiles.length === 0 ? (
        <p className="mobile-docs-gallery__empty">
          No files yet. Upload photos or PDFs from the home feed to populate this gallery.
        </p>
      ) : (
        <div className="mobile-docs-gallery__grid">
          {tiles.map((tile) => (
            <article
              key={tile.id}
              className={`mobile-docs-gallery__tile${
                tile.isImage ? " mobile-docs-gallery__tile--image" : ""
              }`}
            >
              {tile.url ? (
                <a
                  className="mobile-docs-gallery__preview"
                  href={tile.url}
                  target="_blank"
                  rel="noreferrer"
                  style={
                    tile.isImage
                      ? { backgroundImage: `url(${tile.url})` }
                      : undefined
                  }
                >
                  {!tile.isImage ? (
                    <span className="mobile-docs-gallery__preview-badge">
                      {tile.type.split("/").pop() ?? "file"}
                    </span>
                  ) : null}
                </a>
              ) : (
                <div className="mobile-docs-gallery__preview mobile-docs-gallery__preview--placeholder">
                  <span>{tile.name.substring(0, 1).toUpperCase()}</span>
                </div>
              )}
              <div className="mobile-docs-gallery__info">
                <h3>{tile.name}</h3>
                <p>
                  {new Date(tile.date).toLocaleDateString()} ·{" "}
                  {formatSize(tile.size)}
                </p>
              </div>
              {canManageFiles && onRemoveFile ? (
                <button
                  type="button"
                  className="mobile-docs-gallery__remove"
                  onClick={() => onRemoveFile(tile.id)}
                >
                  Remove
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
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

export default MobileDocsGallery;
