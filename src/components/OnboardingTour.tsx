import { useEffect, useMemo, useState, useRef } from "react";

type OnboardingTourProps = {
  isOpen: boolean;
  onRequestClose: (completed: boolean) => void;
};

type TourStep = {
  id: string;
  title: string;
  body: string;
  highlight?: string;
  tip?: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    id: "projects",
    title: "Pick or create a project",
    body:
      "Projects power everything in Clearview. Use the sidebar to switch contexts, invite teammates, or spin up a new build in seconds.",
    tip: "Need a quick start? Create a demo project to explore without touching live data.",
    highlight: "sidebar",
  },
  {
    id: "calendar",
    title: "Plan the build calendar",
    body:
      "Each day tile shows the schedule, site uploads, and crew notes. Click a day to add files from the field or leave instructions for the team.",
    tip: "Drag horizontally to skim the month and use + Add file to capture progress photos.",
    highlight: "calendar",
  },
  {
    id: "notes",
    title: "Share daily context",
    body:
      "Day notes keep everyone aligned. Open any note to edit, see who added it, or follow up with changes. Clearview tracks the full history for you.",
    tip: "Pin important updates by editing the note and using the viewer to copy details into your report.",
    highlight: "notes",
  },
  {
    id: "change-orders",
    title: "Track change orders",
    body:
      "Send, review, and approve change orders without leaving the app. Clearview keeps clients in the loop and timestamps every decision.",
    tip: "Invite reviewers as project owners to let them approve or deny requests instantly.",
    highlight: "change-orders",
  },
];

const PROGRESS_LABELS: Record<string, string> = {
  sidebar: "Sidebar",
  calendar: "Daily schedule",
  notes: "Notes & uploads",
  "change-orders": "Change orders",
};

const getLabelForStep = (step: TourStep) => PROGRESS_LABELS[step.highlight ?? step.id] ?? step.title;

const formatStepCounter = (index: number, total: number) => `Step ${index + 1} of ${total}`;

const OnboardingTour = ({ isOpen, onRequestClose }: OnboardingTourProps) => {
  const [stepIndex, setStepIndex] = useState(0);
  const totalSteps = TOUR_STEPS.length;
  const headingId = "onboarding-tour-heading";
  const descriptionId = "onboarding-tour-description";
  const startButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStepIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onRequestClose(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "arrowright") {
        event.preventDefault();
        setStepIndex((current) => Math.min(current + 1, totalSteps - 1));
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "arrowleft") {
        event.preventDefault();
        setStepIndex((current) => Math.max(current - 1, 0));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onRequestClose, totalSteps]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      startButtonRef.current?.focus();
    }, 50);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen, stepIndex]);

  const step = useMemo(() => TOUR_STEPS[stepIndex], [stepIndex]);

  if (!isOpen) {
    return null;
  }

  const goPrevious = () => setStepIndex((prev) => Math.max(prev - 1, 0));
  const goNext = () => setStepIndex((prev) => Math.min(prev + 1, totalSteps - 1));
  const handleFinish = () => onRequestClose(true);
  const handleDismiss = () => onRequestClose(false);
  const isLastStep = stepIndex === totalSteps - 1;

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={descriptionId}>
      <div className="tour">
        <header className="tour__header">
          <div>
            <p className="tour__kicker">{formatStepCounter(stepIndex, totalSteps)}</p>
            <h2 id={headingId}>{step.title}</h2>
          </div>
          <button type="button" className="tour__close" onClick={handleDismiss} aria-label="Skip the tutorial">
            ×
          </button>
        </header>
        <div className="tour__body">
          <p id={descriptionId} className="tour__lead">
            {step.body}
          </p>
          {step.tip && (
            <div className="tour__tip">
              <strong>Pro tip:</strong> {step.tip}
            </div>
          )}
          <ul className="tour__progress" aria-label="Tutorial progress">
            {TOUR_STEPS.map((item, index) => {
              const label = getLabelForStep(item);
              const isActive = index === stepIndex;
              const isComplete = index < stepIndex;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`tour__progress-step${isActive ? " tour__progress-step--active" : ""}${isComplete ? " tour__progress-step--complete" : ""}`}
                    onClick={() => setStepIndex(index)}
                    aria-current={isActive ? "step" : undefined}
                  >
                    <span className="tour__progress-label">{label}</span>
                    <span className="tour__progress-index" aria-hidden>
                      {index + 1}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <footer className="tour__footer">
          <button type="button" className="tour__secondary" onClick={handleDismiss}>
            Skip
          </button>
          <div className="tour__actions">
            <button
              type="button"
              className="tour__ghost"
              onClick={goPrevious}
              disabled={stepIndex === 0}
            >
              Back
            </button>
            <button
              type="button"
              className="tour__primary"
              onClick={isLastStep ? handleFinish : goNext}
              ref={startButtonRef}
            >
              {isLastStep ? "Finish tour" : "Next"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default OnboardingTour;
