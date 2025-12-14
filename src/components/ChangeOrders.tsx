import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useNotifications } from "../workspace/NotificationContext";
import {
  ChangeOrder,
  ChangeOrderLineItem,
  ChangeOrderRecipient,
  ChangeOrderRecipientStatus,
  ChangeOrderStatus,
  Project,
} from "../types";

type ChangeOrderLineItemDraft = {
  id: string;
  title: string;
  description: string;
  impactDays: string;
  cost: string;
};

type ChangeOrderRecipientDraft = {
  id: string;
  name: string;
  email: string;
};

type ChangeOrderFormState = {
  subject: string;
  description: string;
  recipientName: string;
  recipientEmail: string;
  lineItems: ChangeOrderLineItemDraft[];
  recipients: ChangeOrderRecipientDraft[];
};

type ChangeOrderPayload = {
  subject: string;
  description: string;
  recipientName: string;
  recipientEmail: string;
  lineItems: ChangeOrderLineItem[];
  recipients: Array<{ email: string; name?: string | null }>;
};

type ChangeOrdersProps = {
  project: Project | null;
  orders: ChangeOrder[];
  onCreate: (input: ChangeOrderPayload) => Promise<void> | void;
  onDelete: (orderId: string) => Promise<void> | void;
  onChangeStatus: (
    orderId: string,
    status: ChangeOrderStatus,
    options?: { responseMessage?: string | null }
  ) => Promise<void> | void;
  isLoading?: boolean;
};

const statusLabel: Record<ChangeOrderStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  approved_with_conditions: "Approved w/ conditions",
  denied: "Denied",
  needs_info: "Needs more info",
};

const statusBadgeClass: Record<ChangeOrderStatus, string> = {
  pending: " change-order-card__badge--pending",
  approved: " change-order-card__badge--approved",
  approved_with_conditions: " change-order-card__badge--conditional",
  denied: " change-order-card__badge--denied",
  needs_info: " change-order-card__badge--needs-info",
};

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const CHANGE_ORDER_GUIDANCE_MESSAGE =
  "We'll email every recipient with an approval link once you send this change order.";

const CHANGE_ORDER_GUIDANCE_POINTS = [
  "Primary contact receives the change order immediately.",
  "Each recipient can approve, deny, or request more info from their email.",
  "Attachments stay organized on the project timeline.",
];

type ChangeOrdersFilter = "all" | "awaiting" | "needs_info" | "signed_off" | "denied";

type TimelineEntry = {
  id: string;
  title: string;
  description?: string;
  timestamp?: string | null;
  tone: "pending" | "success" | "danger" | "info";
};

const STATUS_FILTER_OPTIONS: Array<{ label: string; value: ChangeOrdersFilter }> = [
  { label: "All", value: "all" },
  { label: "Awaiting decision", value: "awaiting" },
  { label: "Needs more info", value: "needs_info" },
  { label: "Signed off", value: "signed_off" },
  { label: "Denied", value: "denied" },
];

const statusPillClass: Record<ChangeOrderStatus, string> = {
  pending: "change-orders__status-pill change-orders__status-pill--pending",
  approved: "change-orders__status-pill change-orders__status-pill--approved",
  approved_with_conditions: "change-orders__status-pill change-orders__status-pill--conditions",
  denied: "change-orders__status-pill change-orders__status-pill--denied",
  needs_info: "change-orders__status-pill change-orders__status-pill--info",
};

const generateId = (prefix: string) => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createEmptyLineItemDraft = (): ChangeOrderLineItemDraft => ({
  id: generateId("item"),
  title: "",
  description: "",
  impactDays: "",
  cost: "",
});

const createEmptyRecipientDraft = (): ChangeOrderRecipientDraft => ({
  id: generateId("recipient"),
  name: "",
  email: "",
});

const createEmptyForm = (): ChangeOrderFormState => ({
  subject: "",
  description: "",
  recipientName: "",
  recipientEmail: "",
  lineItems: [createEmptyLineItemDraft()],
  recipients: [createEmptyRecipientDraft()],
});

const countRecipientDrafts = (
  primaryEmail: string,
  recipients: ChangeOrderRecipientDraft[],
) => {
  const unique = new Set<string>();
  const track = (value?: string | null) => {
    const email = value?.trim().toLowerCase();
    if (email) {
      unique.add(email);
    }
  };
  track(primaryEmail);
  recipients.forEach((recipient) => track(recipient.email));
  return unique.size;
};

const countLineItemDrafts = (items: ChangeOrderLineItemDraft[]) =>
  items.filter(
    (item) =>
      item.title.trim() ||
      item.description.trim() ||
      item.impactDays.trim() ||
      item.cost.trim(),
  ).length;

const normalizeLineItems = (
  items: ChangeOrderLineItemDraft[],
): ChangeOrderLineItem[] =>
  items.map((item) => ({
    id: item.id,
    title: item.title.trim(),
    description: item.description.trim(),
    impactDays: Number.isFinite(Number(item.impactDays))
      ? Number(item.impactDays)
      : 0,
    cost: Number.isFinite(Number(item.cost)) ? Number(item.cost) : 0,
  }));

const pruneLineItems = (items: ChangeOrderLineItem[]) =>
  items.filter(
    (item) =>
      item.title ||
      item.description ||
      (Number.isFinite(item.cost) && item.cost !== 0) ||
      (Number.isFinite(item.impactDays) && item.impactDays !== 0),
  );

const normalizeRecipients = (
  items: ChangeOrderRecipientDraft[],
) =>
  items
    .map((item) => ({
      id: item.id,
      name: item.name.trim(),
      email: item.email.trim().toLowerCase(),
    }))
    .filter((item) => item.email.length > 0);

const pruneRecipients = (items: ReturnType<typeof normalizeRecipients>) =>
  items.filter((item) => item.email.length > 0);

const buildRecipientPayload = (
  primaryName: string,
  primaryEmail: string,
  drafts: ChangeOrderRecipientDraft[],
) => {
  const normalized = pruneRecipients(normalizeRecipients(drafts));
  const emailSet = new Set<string>();
  const result: Array<{ email: string; name?: string | null }> = [];

  const cleanedPrimaryEmail = primaryEmail.trim().toLowerCase();
  if (cleanedPrimaryEmail) {
    emailSet.add(cleanedPrimaryEmail);
    result.push({
      email: cleanedPrimaryEmail,
      name: primaryName.trim() || null,
    });
  }

  normalized.forEach((recipient) => {
    if (!emailSet.has(recipient.email)) {
      emailSet.add(recipient.email);
      result.push({
        email: recipient.email,
        name: recipient.name || null,
      });
    }
  });

  return result;
};

const calculateTotalCost = (
  items: ChangeOrderLineItemDraft[] | ChangeOrderLineItem[],
) =>
  items.reduce((total, item) => total + (Number(item.cost) || 0), 0);

const recipientStatusLabel: Record<ChangeOrderRecipientStatus, string> = {
  pending: "Awaiting",
  approved: "Approved",
  approved_with_conditions: "Approved w/ conditions",
  denied: "Denied",
  needs_info: "Needs info",
};

const recipientStatusClass: Record<ChangeOrderRecipientStatus, string> = {
  pending: "recipient-chip recipient-chip--pending",
  approved: "recipient-chip recipient-chip--approved",
  approved_with_conditions: "recipient-chip recipient-chip--conditional",
  denied: "recipient-chip recipient-chip--denied",
  needs_info: "recipient-chip recipient-chip--needs-info",
};

const formatRelativeTime = (isoDate: string | null | undefined) => {
  if (!isoDate) {
    return "";
  }
  const value = new Date(isoDate);
  if (Number.isNaN(value.getTime())) {
    return "";
  }

  const diffMs = value.getTime() - Date.now();
  const minutes = Math.round(diffMs / 60000);
  const absMinutes = Math.abs(minutes);

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absMinutes < 60) {
    return rtf.format(Math.round(minutes), "minute");
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return rtf.format(hours, "hour");
  }
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) {
    return rtf.format(days, "day");
  }
  const months = Math.round(days / 30);
  return rtf.format(months, "month");
};

const formatDateDisplay = (isoDate?: string | null) => {
  if (!isoDate) {
    return "";
  }
  const value = new Date(isoDate);
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  return value.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};


const ChangeOrderComposer = ({
  project,
  onCreate,
  onClose,
}: {
  project: Project | null;
  onCreate: ChangeOrdersProps["onCreate"];
  onClose?: () => void;
}) => {
  const { push } = useNotifications();
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<ChangeOrderFormState>({
    defaultValues: createEmptyForm(),
  });

  const {
    fields: lineItemFields,
    append: appendLineItem,
    remove: removeLineItem,
  } = useFieldArray({ control, name: "lineItems" });

  const {
    fields: recipientFields,
    append: appendRecipient,
    remove: removeRecipient,
  } = useFieldArray({ control, name: "recipients" });

  const watchedLineItems = watch("lineItems");
  const watchedRecipients = watch("recipients");
  const primaryRecipientEmail = watch("recipientEmail");

  const createLineItemCount = useMemo(
    () => countLineItemDrafts(watchedLineItems),
    [watchedLineItems],
  );
  const createRecipientCount = useMemo(
    () => countRecipientDrafts(primaryRecipientEmail, watchedRecipients),
    [primaryRecipientEmail, watchedRecipients],
  );
  const createTotalCost = useMemo(
    () => calculateTotalCost(watchedLineItems),
    [watchedLineItems],
  );

  const onSubmit = handleSubmit(async (values) => {
    clearErrors("root");

    const subject = values.subject.trim();
    if (!subject) {
      setError("subject", { type: "required", message: "Subject is required." });
      push("error", "Subject is required.");
      return;
    }

    const recipientEmail = values.recipientEmail.trim();
    const recipientPayload = buildRecipientPayload(
      values.recipientName,
      recipientEmail,
      values.recipients,
    );

    if (recipientPayload.length === 0) {
      setError("root", { type: "manual", message: "Add at least one recipient email." });
      push("error", "Add at least one recipient email.");
      return;
    }

    try {
      const lineItems = pruneLineItems(normalizeLineItems(values.lineItems));
      await Promise.resolve(
        onCreate({
          subject,
          description: values.description,
          recipientName: values.recipientName,
          recipientEmail,
          lineItems,
          recipients: recipientPayload,
        }),
      );
      reset(createEmptyForm());
      clearErrors();
      push("success", "Change order sent.");
      onClose?.();
    } catch (error: any) {
      setError("root", {
        type: "manual",
        message: error?.message ?? "Failed to create change order.",
      });
      throw error;
    }
  });

  const handleClearForm = () => {
    reset(createEmptyForm());
    clearErrors();
  };

  const handleAddLineItem = () => appendLineItem(createEmptyLineItemDraft());
  const handleRemoveLineItem = (index: number) => removeLineItem(index);

  const handleAddRecipient = () => appendRecipient(createEmptyRecipientDraft());
  const handleRemoveRecipient = (index: number) => {
    if (recipientFields.length <= 1) {
      return;
    }
    removeRecipient(index);
  };

  if (!project) {
    return null;
  }

  return (
    <section className="change-order-composer" aria-label="Create change order">
      <form className="change-order-form" onSubmit={onSubmit}>
        <div className="change-order-modal__layout">
          <div className="change-order-modal__primary">
            <section className="change-order-section">
              <div className="change-order-section__header">
                <h4>Change order details</h4>
                <span>Shared with recipients</span>
              </div>
              <div className="change-order-form__grid">
                <label className="change-order-form__field change-order-form__field--span-2">
                  Subject
                  <input
                    {...register("subject")}
                    placeholder="Describe the change"
                    disabled={isSubmitting}
                    required
                  />
                  {errors.subject && (
                    <span className="modal__error">{errors.subject.message}</span>
                  )}
                </label>
                <label className="change-order-form__field">
                  Recipient name
                  <input
                    {...register("recipientName")}
                    placeholder="Jordan Smith"
                    disabled={isSubmitting}
                  />
                </label>
                <label className="change-order-form__field">
                  Recipient email
                  <input
                    {...register("recipientEmail")}
                    type="email"
                    placeholder="jordan@example.com"
                    disabled={isSubmitting}
                    required
                  />
                </label>
                <label className="change-order-form__field change-order-form__field--span-2">
                  Details
                  <textarea
                    {...register("description")}
                    rows={4}
                    placeholder="Add context, costs, or next steps"
                    disabled={isSubmitting}
                  />
                </label>
              </div>
            </section>

            <div className="change-order-recipients">
              <div className="change-order-recipients__header">
                <h4>Recipients</h4>
                <button
                  type="button"
                  className="change-order-recipients__add"
                  onClick={handleAddRecipient}
                  disabled={isSubmitting}
                >
                  Add recipient
                </button>
              </div>
              {recipientFields.map((field, index) => (
                <div key={field.id} className="change-order-recipient-row">
                  <input type="hidden" {...register(`recipients.${index}.id` as const)} defaultValue={field.id} />
                  <label>
                    Name
                    <input
                      {...register(`recipients.${index}.name` as const)}
                      placeholder="Recipient name"
                      disabled={isSubmitting}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      {...register(`recipients.${index}.email` as const)}
                      type="email"
                      placeholder="recipient@example.com"
                      disabled={isSubmitting}
                    />
                  </label>
                  <button
                    type="button"
                    className="change-order-recipient-row__remove"
                    onClick={() => handleRemoveRecipient(index)}
                    aria-label="Remove recipient"
                    disabled={isSubmitting || recipientFields.length <= 1}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <p className="change-order-recipients__helper">
                Each recipient will receive an email with approval options.
              </p>
            </div>

            <div className="change-order-line-items">
              <div className="change-order-line-items__toolbar">
                <h4>Line items</h4>
                <button
                  type="button"
                  className="change-order-line-items__add"
                  onClick={handleAddLineItem}
                  disabled={isSubmitting}
                >
                  Add line item
                </button>
              </div>
              <div className="change-order-line-items__grid">
                <div className="change-order-line-items__grid-head" aria-hidden="true">
                  <span>Item</span>
                  <span>Description</span>
                  <span>Impact (days)</span>
                  <span>Cost</span>
                  <span />
                </div>
                {lineItemFields.map((field, index) => (
                  <div key={field.id} className="change-order-line-items__grid-row">
                    <input type="hidden" {...register(`lineItems.${index}.id` as const)} defaultValue={field.id} />
                    <label className="change-order-line-items__cell">
                      <span className="change-order-line-items__cell-title">Item</span>
                      <input
                        {...register(`lineItems.${index}.title` as const)}
                        placeholder={`Item ${index + 1}`}
                        disabled={isSubmitting}
                      />
                    </label>
                    <label className="change-order-line-items__cell change-order-line-items__cell--description">
                      <span className="change-order-line-items__cell-title">Description</span>
                      <textarea
                        {...register(`lineItems.${index}.description` as const)}
                        rows={2}
                        placeholder="Explain the change"
                        disabled={isSubmitting}
                      />
                    </label>
                    <label className="change-order-line-items__cell change-order-line-items__cell--number">
                      <span className="change-order-line-items__cell-title">Impact (days)</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        {...register(`lineItems.${index}.impactDays` as const)}
                        disabled={isSubmitting}
                      />
                    </label>
                    <label className="change-order-line-items__cell change-order-line-items__cell--number">
                      <span className="change-order-line-items__cell-title">Cost</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        {...register(`lineItems.${index}.cost` as const)}
                        disabled={isSubmitting}
                      />
                    </label>
                    <button
                      type="button"
                      className="change-order-line-item__remove"
                      onClick={() => handleRemoveLineItem(index)}
                      aria-label={`Remove line item ${index + 1}`}
                      disabled={isSubmitting}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <aside className="change-order-modal__aside">
            <div className="change-order-summary-card">
              <div className="change-order-summary-card__header">
                <h4>Send overview</h4>
                <span className="change-order-summary-card__project">
                  {project
                    ? [project.name, project.referenceId].filter(Boolean).join(" / ")
                    : "Workspace change order"}
                </span>
              </div>
              <div className="change-order-summary-card__metrics">
                <div className="change-order-summary-card__metric">
                  <span className="change-order-summary-card__label">Recipients</span>
                  <strong>{createRecipientCount}</strong>
                </div>
                <div className="change-order-summary-card__metric">
                  <span className="change-order-summary-card__label">Line items</span>
                  <strong>{createLineItemCount}</strong>
                </div>
                <div className="change-order-summary-card__metric">
                  <span className="change-order-summary-card__label">Estimated cost</span>
                  <strong>{currencyFormatter.format(createTotalCost)}</strong>
                </div>
              </div>
            </div>
            {errors.root && <p className="modal__error">{errors.root.message}</p>}
            <div className="modal__actions modal__actions--vertical">
              <button
                type="button"
                className="modal__secondary"
                onClick={handleClearForm}
                disabled={isSubmitting}
              >
                Clear form
              </button>
              <button type="submit" className="modal__primary" disabled={isSubmitting}>
                {isSubmitting ? "Sending..." : "Send change order"}
              </button>
            </div>
          </aside>
        </div>
      </form>
    </section>
  );
};

﻿const ChangeOrders = ({
  project,
  orders,
  onCreate,
  onDelete,
  onChangeStatus,
  isLoading = false,
}: ChangeOrdersProps) => {
  const { push } = useNotifications();
  const [filter, setFilter] = useState<ChangeOrdersFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isResponseOpen, setIsResponseOpen] = useState(false);
  const [responseTarget, setResponseTarget] = useState<{ id: string; status: ChangeOrderStatus } | null>(null);
  const [responseMessage, setResponseMessage] = useState("");
  const [responseError, setResponseError] = useState<string | null>(null);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => (a.sentAt > b.sentAt ? -1 : 1)),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    let result = sortedOrders;
    if (filter !== "all") {
      result = result.filter((order) => {
        switch (filter) {
          case "awaiting":
            return order.status === "pending";
          case "needs_info":
            return order.status === "needs_info";
          case "signed_off":
            return order.status === "approved" || order.status === "approved_with_conditions";
          case "denied":
            return order.status === "denied";
          default:
            return true;
        }
      });
    }
    const query = searchTerm.trim().toLowerCase();
    if (query.length > 0) {
      result = result.filter((order) => {
        const haystacks: string[] = [];
        if (order.subject) haystacks.push(order.subject);
        if (order.description) haystacks.push(order.description);
        if (order.recipientName) haystacks.push(order.recipientName);
        if (order.recipientEmail) haystacks.push(order.recipientEmail);
        if (order.sentAt) haystacks.push(formatDateDisplay(order.sentAt));
        order.recipients.forEach((recipient) => {
          if (recipient.name) haystacks.push(recipient.name);
          if (recipient.email) haystacks.push(recipient.email);
        });
        return haystacks.some((value) => value.toLowerCase().includes(query));
      });
    }
    return result;
  }, [sortedOrders, filter, searchTerm]);

  useEffect(() => {
    if (filteredOrders.length === 0) {
      setSelectedOrderId(null);
      return;
    }
    setSelectedOrderId((current) =>
      current && filteredOrders.some((order) => order.id === current)
        ? current
        : filteredOrders[0].id,
    );
  }, [filteredOrders]);

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) {
      return filteredOrders[0] ?? null;
    }
    return (
      filteredOrders.find((order) => order.id === selectedOrderId) ??
      sortedOrders.find((order) => order.id === selectedOrderId) ??
      filteredOrders[0] ??
      null
    );
  }, [filteredOrders, sortedOrders, selectedOrderId]);

  const stats = useMemo(() => {
    const counts: Record<ChangeOrderStatus, number> = {
      pending: 0,
      approved: 0,
      approved_with_conditions: 0,
      denied: 0,
      needs_info: 0,
    };
    let totalValue = 0;
    let awaitingValue = 0;
    let approvedValue = 0;

    sortedOrders.forEach((order) => {
      counts[order.status] += 1;
      const orderValue = calculateTotalCost(order.lineItems);
      totalValue += orderValue;
      if (order.status === "pending" || order.status === "needs_info") {
        awaitingValue += orderValue;
      }
      if (order.status === "approved" || order.status === "approved_with_conditions") {
        approvedValue += orderValue;
      }
    });

    const nextDecision =
      sortedOrders
        .filter((order) => order.status === "pending" || order.status === "needs_info")
        .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())[0] ?? null;

    return {
      counts,
      totalValue,
      awaitingValue,
      approvedValue,
      total: sortedOrders.length,
      awaiting: counts.pending + counts.needs_info,
      signedOff: counts.approved + counts.approved_with_conditions,
      nextDecision,
    };
  }, [sortedOrders]);

  const closeResponseModal = useCallback(() => {
    setIsResponseOpen(false);
    setResponseTarget(null);
    setResponseMessage("");
    setResponseError(null);
    setIsActionSubmitting(false);
  }, []);

  const handleStatusUpdate = useCallback(
    async (orderId: string, status: ChangeOrderStatus, message?: string | null) => {
      try {
        setIsActionSubmitting(true);
        await Promise.resolve(
          onChangeStatus(orderId, status, { responseMessage: message ?? null }),
        );
        push("success", "Change order updated.");
        closeResponseModal();
      } catch (err: any) {
        console.error("Error updating change order status:", err);
        const messageText = err?.message ?? "Failed to update status.";
        setResponseError(messageText);
        push("error", messageText);
      } finally {
        setIsActionSubmitting(false);
      }
    },
    [onChangeStatus, closeResponseModal, push],
  );

  const handleApprove = useCallback(() => {
    if (!selectedOrder) {
      return;
    }
    void handleStatusUpdate(selectedOrder.id, "approved");
  }, [selectedOrder, handleStatusUpdate]);

  const handleDeny = useCallback(() => {
    if (!selectedOrder) {
      return;
    }
    void handleStatusUpdate(selectedOrder.id, "denied");
  }, [selectedOrder, handleStatusUpdate]);

  const handleRequestInfo = useCallback(() => {
    if (!selectedOrder) {
      return;
    }
    setResponseTarget({ id: selectedOrder.id, status: "needs_info" });
    setResponseMessage("");
    setResponseError(null);
    setIsResponseOpen(true);
  }, [selectedOrder]);

  const handleDelete = useCallback(async () => {
    if (!selectedOrder) {
      return;
    }
    const shouldDelete =
      typeof window === "undefined"
        ? true
        : window.confirm("Delete this change order?");
    if (!shouldDelete) {
      return;
    }
    try {
      await Promise.resolve(onDelete(selectedOrder.id));
      push("success", "Change order removed.");
      setSelectedOrderId(null);
    } catch (err) {
      console.error("Error deleting change order:", err);
      push("error", err instanceof Error ? err.message : "Failed to delete change order.");
    }
  }, [selectedOrder, onDelete, push]);

  const openComposer = useCallback(() => setIsComposerOpen(true), []);
  const closeComposer = useCallback(() => setIsComposerOpen(false), []);

  const handleFilterChange = (value: ChangeOrdersFilter) => {
    setFilter(value);
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const selectedOrderValue = selectedOrder ? calculateTotalCost(selectedOrder.lineItems) : 0;
  const selectedOrderCode = useMemo(() => {
    if (!selectedOrder) {
      return "";
    }
    const filteredIndex = filteredOrders.findIndex((order) => order.id === selectedOrder.id);
    const fallbackIndex =
      filteredIndex >= 0
        ? filteredIndex
        : sortedOrders.findIndex((order) => order.id === selectedOrder.id);
    if (fallbackIndex < 0) {
      return "";
    }
    return `CO-${String(fallbackIndex + 1).padStart(3, "0")}`;
  }, [filteredOrders, selectedOrder, sortedOrders]);

  const filterCounts = useMemo(
    (): Record<ChangeOrdersFilter, number> => ({
      all: stats.total,
      awaiting: stats.awaiting,
      needs_info: stats.counts.needs_info,
      signed_off: stats.signedOff,
      denied: stats.counts.denied,
    }),
    [stats],
  );

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    if (!selectedOrder) {
      return [];
    }

    const events: TimelineEntry[] = [
      {
        id: `${selectedOrder.id}-submitted`,
        title: "Submitted for approval",
        description: selectedOrder.createdByName
          ? `Sent by ${selectedOrder.createdByName}`
          : undefined,
        timestamp: selectedOrder.sentAt,
        tone: "info",
      },
    ];

    selectedOrder.recipients.forEach((recipient) => {
      const recipientLabel = recipient.name || recipient.email || "Recipient";
      let tone: TimelineEntry["tone"] = "pending";
      if (recipient.status === "approved" || recipient.status === "approved_with_conditions") {
        tone = "success";
      } else if (recipient.status === "denied") {
        tone = "danger";
      } else if (recipient.status === "needs_info") {
        tone = "info";
      }

      events.push({
        id: `${selectedOrder.id}-recipient-${recipient.id}`,
        title:
          recipient.status === "pending"
            ? `${recipientLabel} awaiting review`
            : `${recipientLabel} ${recipientStatusLabel[recipient.status]}`,
        description: recipient.conditionNote || undefined,
        timestamp: recipient.respondedAt ?? null,
        tone,
      });
    });

    if (selectedOrder.responseAt) {
      events.push({
        id: `${selectedOrder.id}-response`,
        title: "Owner response recorded",
        description: selectedOrder.responseMessage || undefined,
        timestamp: selectedOrder.responseAt,
        tone: selectedOrder.status === "denied" ? "danger" : "success",
      });
    }

    events.push({
      id: `${selectedOrder.id}-updated`,
      title: "Log updated",
      description: selectedOrder.updatedAt
        ? `Updated ${formatRelativeTime(selectedOrder.updatedAt)}`
        : undefined,
      timestamp: selectedOrder.updatedAt,
      tone: "info",
    });

    return events.sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    });
  }, [selectedOrder]);

  return (
    <section className="change-orders">
      <header className="change-orders__hero">
        <div className="change-orders__hero-top">
          <div className="change-orders__hero-title">
            <span>Change orders</span>
            <h1>Keep every scope change visible</h1>
            <p>
              Coordinate approvals, capture decisions, and keep stakeholders aligned before the work begins.
            </p>
          </div>
          <div className="change-orders__hero-actions">
            <button
              type="button"
              className="change-orders__button change-orders__button--primary"
              onClick={openComposer}
              disabled={!project}
            >
              New change order
            </button>
          </div>
        </div>
        <div className="change-orders__hero-meta">
          <div>
            <span>Active project</span>
            <strong>
              {project
                ? [project.name, project.referenceId].filter(Boolean).join(" • ")
                : "No project selected"}
            </strong>
            {project?.dueDate && <small>Due {formatDateDisplay(project.dueDate)}</small>}
          </div>
          <div>
            <span>Awaiting decision</span>
            <strong>{stats.awaiting}</strong>
            <small>{currencyFormatter.format(stats.awaitingValue)}</small>
          </div>
          <div>
            <span>Signed off</span>
            <strong>{stats.signedOff}</strong>
            <small>{currencyFormatter.format(stats.approvedValue)}</small>
          </div>
        </div>
      </header>

      <div className="change-orders__summary">
        <div className="change-orders__summary-card">
          <span>Awaiting decision</span>
          <strong>{stats.awaiting}</strong>
          <small>{currencyFormatter.format(stats.awaitingValue)}</small>
        </div>
        <div className="change-orders__summary-card">
          <span>Signed off</span>
          <strong>{stats.signedOff}</strong>
          <small>{currencyFormatter.format(stats.approvedValue)}</small>
        </div>
        <div className="change-orders__summary-card">
          <span>Total requests</span>
          <strong>{stats.total}</strong>
          <strong>{currencyFormatter.format(stats.totalValue)}</strong>
        </div>
        <div className="change-orders__summary-card change-orders__summary-card--wide">
          <span>Next decision</span>
          {stats.nextDecision ? (
            <>
              <strong>{stats.nextDecision.subject || "Untitled change order"}</strong>
              <small>
                {formatDateDisplay(stats.nextDecision.sentAt)} · {formatRelativeTime(stats.nextDecision.sentAt)}
              </small>
            </>
          ) : (
            <strong>No pending approvals</strong>
          )}
        </div>
      </div>

      <div className="change-orders__notice">
        <strong>Heads up:</strong>
        <span>{CHANGE_ORDER_GUIDANCE_MESSAGE}</span>
      </div>

      <div className="change-orders__layout">
        <div className="change-orders__table-card" role="region" aria-live="polite">
          <div className="change-orders__table-headline">
            <div>
              <h2>Change order log</h2>
              <span>
                {filteredOrders.length} change order{filteredOrders.length === 1 ? "" : "s"} shown
              </span>
            </div>
            <div className="change-orders__table-filters">
              <label className="change-orders__search">
                <input
                  type="search"
                  value={searchTerm}
                  onChange={handleSearchChange}
                  placeholder="Search subject or contact"
                />
              </label>
              <div className="change-orders__chips" role="tablist" aria-label="Filter change orders">
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`change-orders__chip${filter === option.value ? " is-active" : ""}`}
                    aria-pressed={filter === option.value}
                    onClick={() => handleFilterChange(option.value)}
                  >
                    <span>{option.label}</span>
                    <span className="change-orders__chip-count">{filterCounts[option.value]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="change-orders__table-wrapper">
            <table className="change-orders__table">
              <thead>
                <tr className="change-orders__table-header">
                  <th scope="col">Change order</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Sent</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Value</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {!project ? (
                  <tr>
                    <td colSpan={6} className="change-orders__table-empty">
                      Select a project to manage change orders.
                    </td>
                  </tr>
                ) : isLoading ? (
                  <tr>
                    <td colSpan={6} className="change-orders__table-empty">Loading change orders...</td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="change-orders__table-empty">
                      No change orders match your filters.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order, index) => {
                    const total = calculateTotalCost(order.lineItems);
                    const isSelected = selectedOrder?.id === order.id;
                    const contact =
                      order.recipientName && order.recipientEmail
                        ? `${order.recipientName} (${order.recipientEmail})`
                        : order.recipientName || order.recipientEmail || "--";
                    const sentDate = formatDateDisplay(order.sentAt) || "--";
                    const sentRelative = order.sentAt ? formatRelativeTime(order.sentAt) : "";
                    const updatedDate = formatDateDisplay(order.updatedAt) || "--";
                    const updatedRelative = order.updatedAt ? formatRelativeTime(order.updatedAt) : "";
                    const displayCode = `CO-${String(index + 1).padStart(3, "0")}`;
                    return (
                      <tr
                        key={order.id}
                        className={`change-orders__row${isSelected ? " is-selected" : ""}`}
                        onClick={() => setSelectedOrderId(order.id)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedOrderId(order.id);
                          }
                        }}
                        aria-selected={isSelected}
                      >
                        <td>
                          <div className="change-orders__row-subject">
                            <span className="change-orders__row-code">{displayCode}</span>
                            <strong>{order.subject || "Untitled change order"}</strong>
                            {order.description && <span>{order.description}</span>}
                          </div>
                        </td>
                        <td>
                          <div className="change-orders__row-contact">
                            <strong>{contact}</strong>
                            <span>
                              {order.recipients.length} recipient{order.recipients.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="change-orders__row-date">
                            <strong>{sentDate}</strong>
                            {sentRelative && <span>{sentRelative}</span>}
                          </div>
                        </td>
                        <td>
                          <div className="change-orders__row-date">
                            <strong>{updatedDate}</strong>
                            {updatedRelative && <span>{updatedRelative}</span>}
                          </div>
                        </td>
                        <td className="change-orders__row-value">
                          {currencyFormatter.format(total)}
                        </td>
                        <td className="change-orders__row-status">
                          <span className={statusPillClass[order.status]}>{statusLabel[order.status]}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="change-orders__detail" role="region" aria-live="polite">
          {!project ? (
            <div className="change-orders__detail-empty">Select a project to see change order details.</div>
          ) : !selectedOrder ? (
            filteredOrders.length === 0 ? (
              <div className="change-orders__detail-empty">No change orders to display.</div>
            ) : (
              <div className="change-orders__detail-empty">Select a change order to see its details.</div>
            )
          ) : (
            <>
              <header className="change-orders__detail-header">
                <div>
                  {selectedOrderCode && (
                    <span className="change-orders__detail-code">{selectedOrderCode}</span>
                  )}
                  <h2>{selectedOrder.subject || "Untitled change order"}</h2>
                  <div className="change-orders__detail-meta">
                    <div className="change-orders__detail-meta-card">
                      <span>Primary contact</span>
                      <strong>
                        {selectedOrder.recipientName
                          ? `${selectedOrder.recipientName} (${selectedOrder.recipientEmail})`
                          : selectedOrder.recipientEmail || "--"}
                      </strong>
                    </div>
                    <div className="change-orders__detail-meta-card">
                      <span>Sent</span>
                      <strong>{formatDateDisplay(selectedOrder.sentAt) || "--"}</strong>
                      {selectedOrder.sentAt && (
                        <small>{formatRelativeTime(selectedOrder.sentAt)}</small>
                      )}
                    </div>
                    <div className="change-orders__detail-meta-card">
                      <span>Last updated</span>
                      <strong>{formatDateDisplay(selectedOrder.updatedAt) || "--"}</strong>
                      {selectedOrder.updatedAt && (
                        <small>{formatRelativeTime(selectedOrder.updatedAt)}</small>
                      )}
                    </div>
                    <div className="change-orders__detail-meta-card">
                      <span>Total value</span>
                      <strong>{currencyFormatter.format(selectedOrderValue)}</strong>
                    </div>
                  </div>
                </div>
                <span className={`change-order-card__badge${statusBadgeClass[selectedOrder.status]}`}>
                  {statusLabel[selectedOrder.status]}
                </span>
              </header>

              {selectedOrder.description && (
                <section className="change-orders__detail-section">
                  <h3>Scope summary</h3>
                  <p className="change-orders__detail-note">{selectedOrder.description}</p>
                </section>
              )}

              <section className="change-orders__detail-section">
                <h3>Line items</h3>
                {selectedOrder.lineItems.length === 0 ? (
                  <p className="change-orders__detail-note">No line items added.</p>
                ) : (
                  <div className="change-orders__line-items-table">
                    <div className="change-orders__line-items-row change-orders__line-items-row--head">
                      <span>Item</span>
                      <span>Description</span>
                      <span>Impact (days)</span>
                      <span>Cost</span>
                    </div>
                    {selectedOrder.lineItems.map((item) => (
                      <div key={item.id} className="change-orders__line-items-row">
                        <span>{item.title || "-"}</span>
                        <span>{item.description || "-"}</span>
                        <span>{item.impactDays ?? 0}</span>
                        <span>{currencyFormatter.format(Number(item.cost) || 0)}</span>
                      </div>
                    ))}
                    <div className="change-orders__line-items-row change-orders__line-items-row--total">
                      <span>Total</span>
                      <span />
                      <span />
                      <span>{currencyFormatter.format(selectedOrderValue)}</span>
                    </div>
                  </div>
                )}
              </section>

              <section className="change-orders__detail-section">
                <h3>Recipients</h3>
                {selectedOrder.recipients.length === 0 ? (
                  <p className="change-orders__detail-note">No additional recipients were added.</p>
                ) : (
                  <div className="change-orders__recipients-list">
                    {selectedOrder.recipients.map((recipient) => (
                      <div key={recipient.id} className="change-orders__recipient">
                        <div>
                          <strong>{recipient.name || recipient.email}</strong>
                          <span>{recipient.email}</span>
                        </div>
                        <span className={recipientStatusClass[recipient.status]}>
                          {recipientStatusLabel[recipient.status]}
                        </span>
                        {recipient.conditionNote && (
                          <p className="change-orders__recipient-note">
                            "{recipient.conditionNote}"
                          </p>
                        )}
                        {recipient.respondedAt && (
                          <p className="change-orders__recipient-time">
                            {formatRelativeTime(recipient.respondedAt)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="change-orders__detail-section">
                <h3>Timeline</h3>
                {timelineEntries.length === 0 ? (
                  <p className="change-orders__detail-note">
                    Timeline entries will populate after responses arrive.
                  </p>
                ) : (
                  <ul className="change-orders__timeline">
                    {timelineEntries.map((entry) => {
                      const displayDate = entry.timestamp ? formatDateDisplay(entry.timestamp) : "";
                      const relative = entry.timestamp ? formatRelativeTime(entry.timestamp) : "";
                      return (
                        <li
                          key={entry.id}
                          className={`change-orders__timeline-item change-orders__timeline-item--${entry.tone}`}
                        >
                          <span className="change-orders__timeline-marker" aria-hidden="true" />
                          <div className="change-orders__timeline-content">
                            <strong>{entry.title}</strong>
                            {entry.description && <p>{entry.description}</p>}
                            {(displayDate || relative) && (
                              <span className="change-orders__timeline-time">
                                {displayDate}
                                {relative ? ` | ${relative}` : ""}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <div className="change-orders__detail-actions">
                {selectedOrder.status === "pending" && (
                  <>
                    <button
                      type="button"
                      className="change-order-card__action"
                      onClick={handleApprove}
                      disabled={isActionSubmitting}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="change-order-card__action change-order-card__action--danger"
                      onClick={handleDeny}
                      disabled={isActionSubmitting}
                    >
                      Deny
                    </button>
                    <button
                      type="button"
                      className="change-order-card__action change-order-card__action--neutral"
                      onClick={handleRequestInfo}
                      disabled={isActionSubmitting}
                    >
                      Request info
                    </button>
                  </>
                )}
                {selectedOrder.status === "needs_info" && (
                  <>
                    <button
                      type="button"
                      className="change-order-card__action"
                      onClick={handleApprove}
                      disabled={isActionSubmitting}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="change-order-card__action change-order-card__action--danger"
                      onClick={handleDeny}
                      disabled={isActionSubmitting}
                    >
                      Deny
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="change-order-card__action change-order-card__action--danger"
                  onClick={handleDelete}
                  disabled={isActionSubmitting}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      {isComposerOpen && project && (
        <div className="change-orders__composer-overlay" role="dialog" aria-modal="true">
          <div className="change-orders__composer-backdrop" onClick={closeComposer} />
          <div className="change-orders__composer-panel">
            <button
              type="button"
              className="change-orders__composer-close"
              aria-label="Close change order composer"
              onClick={closeComposer}
            >
              Close
            </button>
            <ChangeOrderComposer project={project} onCreate={onCreate} onClose={closeComposer} />
          </div>
        </div>
      )}

      {isResponseOpen && responseTarget && (
        <div className="modal">
          <div className="modal__backdrop" onClick={closeResponseModal} />
          <div className="modal__dialog" role="dialog" aria-modal="true">
            <form
              className="modal__form"
              onSubmit={(event) => {
                event.preventDefault();
                handleStatusUpdate(responseTarget.id, responseTarget.status, responseMessage);
              }}
            >
              <header className="modal__header">
                <h3>Request more information</h3>
                <button
                  type="button"
                  className="modal__close"
                  onClick={closeResponseModal}
                  aria-label="Close request info form"
                >
                  Close
                </button>
              </header>
              <label>
                Message to recipient
                <textarea
                  rows={4}
                  value={responseMessage}
                  onChange={(event) => setResponseMessage(event.target.value)}
                  placeholder="Let the recipient know what you need..."
                  required
                />
              </label>
              {responseError && <p className="modal__error">{responseError}</p>}
              <div className="modal__actions">
                <button type="button" className="modal__secondary" onClick={closeResponseModal}>
                  Cancel
                </button>
                <button type="submit" className="modal__primary" disabled={isActionSubmitting}>
                  {isActionSubmitting ? "Sending..." : "Send request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default ChangeOrders;


