import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type OffCanvasProps = {
  isOpen: boolean;
  onClose: () => void;
  titleId: string;
  children: ReactNode;
};

const OffCanvas = ({ isOpen, onClose, titleId, children }: OffCanvasProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;

    if (container) {
      const focusable = container.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    }

    return () => {
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const overlay = (
    <div className="offcanvas">
      <button
        type="button"
        className="offcanvas__backdrop"
        onClick={onClose}
        aria-label="Close panel"
      />
      <aside
        ref={containerRef}
        className="offcanvas__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="offcanvas__inner">
          <header className="offcanvas__header">
            <h2 id={titleId}>Navigation</h2>
            <button
              type="button"
              className="offcanvas__close"
              onClick={onClose}
              aria-label="Close navigation"
            >
              ×
            </button>
          </header>
          <div className="offcanvas__content">{children}</div>
        </div>
      </aside>
    </div>
  );

  return createPortal(overlay, document.body);
};

export default OffCanvas;
