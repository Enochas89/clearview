import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

type ResponseAction = "approve" | "approve_conditions" | "deny" | "needs_info";

const ACTIONS: Array<{ value: ResponseAction; label: string }> = [
  { value: "approve", label: "Approve" },
  { value: "approve_conditions", label: "Approve w/ conditions" },
  { value: "deny", label: "Deny" },
  { value: "needs_info", label: "Needs info" },
];

const ACTION_SUCCESS_MESSAGE: Record<ResponseAction, string> = {
  approve: "Thanks! Your approval has been recorded.",
  approve_conditions: "Thanks! We've noted your conditional approval.",
  deny: "Your denial has been recorded.",
  needs_info: "Thanks! The project team has been notified that you need more information.",
};

const ChangeOrderResponsePage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const presetActionParam = searchParams.get("action") ?? "";

  const [action, setAction] = useState<ResponseAction | "">(
    ACTIONS.some((a) => a.value === presetActionParam) ? (presetActionParam as ResponseAction) : "",
  );
  const [signature, setSignature] = useState("");
  const [note, setNote] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(token.trim() && action && signature.trim()),
    [token, action, signature],
  );

  useEffect(() => {
    setStatusMessage(null);
    setErrorMessage(null);
  }, [action, signature, note]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    const combinedNote = [signature.trim() ? `Signed by ${signature.trim()}` : null, note.trim() || null]
      .filter(Boolean)
      .join("\n\n");

    setErrorMessage("Change order responses are disabled in this build.");
    setIsSubmitting(false);
  };

  if (!token) {
    return (
      <div className="co-respond">
        <div className="co-respond__card">
          <h1>Invalid link</h1>
          <p>We couldn&apos;t find the response token in this link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="co-respond">
      <div className="co-respond__card">
        <header className="co-respond__header">
          <div>
            <p className="co-respond__eyebrow">Change order response</p>
            <h1>Confirm your decision</h1>
            <p className="co-respond__muted">Select an action, add a signature, and submit.</p>
          </div>
        </header>

        <form className="co-respond__form" onSubmit={handleSubmit}>
          <div className="co-respond__actions">
            {ACTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`co-respond__action${action === item.value ? " is-active" : ""}`}
                onClick={() => setAction(item.value)}
                disabled={isSubmitting}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="co-respond__field">
            Signature (type your name)
            <input
              type="text"
              value={signature}
              onChange={(event) => setSignature(event.target.value)}
              placeholder="Your name"
              required
              disabled={isSubmitting}
            />
          </label>

          <label className="co-respond__field">
            Optional note
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="Add any details or conditions"
              disabled={isSubmitting}
            />
          </label>

          {errorMessage && <p className="co-respond__error">{errorMessage}</p>}
          {statusMessage && <p className="co-respond__success">{statusMessage}</p>}

          <button type="submit" className="co-respond__submit" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit response"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChangeOrderResponsePage;
