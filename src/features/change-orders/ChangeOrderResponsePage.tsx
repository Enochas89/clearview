import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../supabaseClient";

type ResponseStatus = "pending" | "approved" | "approved_with_conditions" | "denied" | "needs_info";

const ACTIONS: Array<{ value: ResponseStatus; label: string }> = [
  { value: "approved", label: "Approve" },
  { value: "approved_with_conditions", label: "Approve w/ conditions" },
  { value: "denied", label: "Deny" },
  { value: "needs_info", label: "Needs info" },
];

const ChangeOrderResponsePage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const presetAction = searchParams.get("action") ?? "";

  const [action, setAction] = useState<ResponseStatus | "">(
    ACTIONS.some((a) => a.value === presetAction) ? (presetAction as ResponseStatus) : "",
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
      .join(" — ");

    try {
      const { data, error } = await supabase.functions.invoke("change-order-respond", {
        body: { token, action, note: combinedNote || null },
      });
      if (error) {
        throw error;
      }
      const message =
        data?.message ||
        (action === "approved"
          ? "Thanks! Your approval has been recorded."
          : action === "approved_with_conditions"
          ? "Thanks! We've noted your conditional approval."
          : action === "denied"
          ? "Your denial has been recorded."
          : "Thanks! The project team has been notified that you need more information.");
      setStatusMessage(message);
    } catch (err: any) {
      const msg = err?.message ?? "We could not record your response. Please try again.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
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
