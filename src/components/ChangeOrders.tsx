import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useNotifications } from "../workspace/NotificationContext";
import {
  ChangeOrder,
  ChangeOrderLineItem,
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
    options?: { responseMessage?: string | null },
  ) => Promise<void> | void;
  isLoading?: boolean;
};

const statusLabel: Record<ChangeOrderStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  approved_with_conditions: "Approved w/ conditions",
  denied: "Denied",
  needs_info: "Needs info",
};

const statusTone: Record<ChangeOrderStatus, string> = {
  pending: "pending",
  approved: "approved",
  approved_with_conditions: "approved-conditions",
  denied: "denied",
  needs_info: "info",
};

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

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

const recipientStatusLabel: Record<ChangeOrderRecipientStatus, string> = {
  pending: "Awaiting",
  approved: "Approved",
  approved_with_conditions: "Approved w/ conditions",
  denied: "Denied",
  needs_info: "Needs info",
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

const countRecipientDrafts = (primaryEmail: string, recipients: ChangeOrderRecipientDraft[]) => {
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

const normalizeLineItems = (items: ChangeOrderLineItemDraft[]): ChangeOrderLineItem[] =>
  items.map((item) => ({
    id: item.id,
    title: item.title.trim(),
    description: item.description.trim(),
    impactDays: Number.isFinite(Number(item.impactDays)) ? Number(item.impactDays) : 0,
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

const normalizeRecipients = (items: ChangeOrderRecipientDraft[]) =>
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

const calculateTotalCost = (items: ChangeOrderLineItemDraft[] | ChangeOrderLineItem[]) =>
  items.reduce((total, item) => total + (Number(item.cost) || 0), 0);

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

  const lineItemCount = useMemo(
    () => countLineItemDrafts(watchedLineItems),
    [watchedLineItems],
  );
  const recipientCount = useMemo(
    () => countRecipientDrafts(primaryRecipientEmail, watchedRecipients),
    [primaryRecipientEmail, watchedRecipients],
  );
  const estimatedCost = useMemo(
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
    <section className="co-composer" aria-label="Create change order">
      <header className="co-composer__header">
        <div>
          <p className="co__eyebrow">New change order</p>
          <h2>Send a clear request</h2>
          <p className="co__muted">Keep it short: subject, context, and who needs to approve.</p>
        </div>
        <div className="co-composer__meta">
          <span>Project</span>
          <strong>{project.name}</strong>
          {project.referenceId && <small>{project.referenceId}</small>}
        </div>
      </header>

      <form className="co-form" onSubmit={onSubmit}>
        <div className="co-form__grid">
          <label className="co-form__field co-form__field--wide">
            Subject
            <input
              {...register("subject")}
              placeholder="Describe the change"
              disabled={isSubmitting}
              required
            />
            {errors.subject && <span className="co-form__error">{errors.subject.message}</span>}
          </label>
          <label className="co-form__field">
            Recipient name
            <input
              {...register("recipientName")}
              placeholder="Jordan Smith"
              disabled={isSubmitting}
            />
          </label>
          <label className="co-form__field">
            Recipient email
            <input
              {...register("recipientEmail")}
              type="email"
              placeholder="jordan@example.com"
              disabled={isSubmitting}
              required
            />
          </label>
          <label className="co-form__field co-form__field--wide">
            Details
            <textarea
              {...register("description")}
              rows={3}
              placeholder="Add context, costs, or next steps"
              disabled={isSubmitting}
            />
          </label>
        </div>

        <div className="co-form__stack">
          <div className="co-form__header">
            <h4>Line items</h4>
            <button type="button" onClick={handleAddLineItem} disabled={isSubmitting}>
              Add item
            </button>
          </div>
          <div className="co-form__list">
            {lineItemFields.map((field, index) => (
              <div key={field.id} className="co-form__row">
                <input
                  type="hidden"
                  {...register(`lineItems.${index}.id` as const)}
                  defaultValue={field.id}
                />
                <label>
                  Title
                  <input
                    {...register(`lineItems.${index}.title` as const)}
                    placeholder={`Item ${index + 1}`}
                    disabled={isSubmitting}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    {...register(`lineItems.${index}.description` as const)}
                    rows={2}
                    placeholder="Explain the change"
                    disabled={isSubmitting}
                  />
                </label>
                <div className="co-form__row-inline">
                  <label>
                    Impact (days)
                    <input
                      type="number"
                      min="0"
                      step="1"
                      {...register(`lineItems.${index}.impactDays` as const)}
                      disabled={isSubmitting}
                    />
                  </label>
                  <label>
                    Cost
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
                    className="co-form__remove"
                    onClick={() => handleRemoveLineItem(index)}
                    aria-label={`Remove line item ${index + 1}`}
                    disabled={isSubmitting}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="co-form__stack">
          <div className="co-form__header">
            <h4>Additional recipients</h4>
            <button type="button" onClick={handleAddRecipient} disabled={isSubmitting}>
              Add recipient
            </button>
          </div>
          <div className="co-form__list">
            {recipientFields.map((field, index) => (
              <div key={field.id} className="co-form__row co-form__row--compact">
                <input
                  type="hidden"
                  {...register(`recipients.${index}.id` as const)}
                  defaultValue={field.id}
                />
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
                  className="co-form__remove"
                  onClick={() => handleRemoveRecipient(index)}
                  aria-label="Remove recipient"
                  disabled={isSubmitting || recipientFields.length <= 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        {errors.root && <p className="co-form__error">{errors.root.message}</p>}

        <div className="co-form__footer">
          <div className="co-form__summary">
            <div>
              <span>Recipients</span>
              <strong>{recipientCount}</strong>
            </div>
            <div>
              <span>Line items</span>
              <strong>{lineItemCount}</strong>
            </div>
            <div>
              <span>Estimated cost</span>
              <strong>{currencyFormatter.format(estimatedCost)}</strong>
            </div>
          </div>
          <div className="co-form__actions">
            <button type="button" onClick={onClose} className="co__ghost" disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="co__primary" disabled={isSubmitting}>
              {isSubmitting ? "Sending..." : "Send change order"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
};

const ChangeOrders = ({
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

    return {
      counts,
      totalValue,
      awaitingValue,
      approvedValue,
      total: sortedOrders.length,
      awaiting: counts.pending + counts.needs_info,
      signedOff: counts.approved + counts.approved_with_conditions,
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
      typeof window === "undefined" ? true : window.confirm("Delete this change order?");
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
        description: selectedOrder.createdByName ? `Sent by ${selectedOrder.createdByName}` : undefined,
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

    return events.sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    });
  }, [selectedOrder]);

  return (
    <section className="co">
      <header className="co__header">
        <div className="co__heading">
          <p className="co__eyebrow">Change orders</p>
          <h1>Keep scope changes simple</h1>
          <p className="co__muted">
            Track requests, capture approvals, and keep everyone aligned without the clutter.
          </p>
          <div className="co__project">
            <span>Active project</span>
            <strong>{project ? project.name : "Select a project"}</strong>
            {project?.referenceId && <small>{project.referenceId}</small>}
          </div>
        </div>
        <div className="co__header-actions">
          <button type="button" className="co__primary" onClick={openComposer} disabled={!project}>
            New change order
          </button>
        </div>
      </header>

      <div className="co__stats">
        <div className="co__stat">
          <span>Awaiting decision</span>
          <strong>{stats.awaiting}</strong>
          <small>{currencyFormatter.format(stats.awaitingValue)}</small>
        </div>
        <div className="co__stat">
          <span>Signed off</span>
          <strong>{stats.signedOff}</strong>
          <small>{currencyFormatter.format(stats.approvedValue)}</small>
        </div>
        <div className="co__stat">
          <span>Total requests</span>
          <strong>{stats.total}</strong>
          <small>{currencyFormatter.format(stats.totalValue)}</small>
        </div>
      </div>

      <div className="co__controls">
        <label className="co__search">
          <input
            type="search"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Search subject or contact"
          />
        </label>
        <div className="co__filters" role="tablist" aria-label="Filter change orders">
          {STATUS_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`co__chip${filter === option.value ? " is-active" : ""}`}
              onClick={() => handleFilterChange(option.value)}
              role="tab"
              aria-selected={filter === option.value}
            >
              {option.label}
              <span className="co__chip-count">{filterCounts[option.value]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="co__grid">
        <div className="co__list" role="region" aria-live="polite">
          <div className="co__list-head">
            <div>
              <h2>Change order log</h2>
              <span>
                {filteredOrders.length} change order{filteredOrders.length === 1 ? "" : "s"} shown
              </span>
            </div>
          </div>

          {isLoading && <div className="co__empty">Loading change orders...</div>}
          {!isLoading && filteredOrders.length === 0 && (
            <div className="co__empty">No change orders match your filters.</div>
          )}

          {!isLoading && filteredOrders.length > 0 && (
            <ul className="co__rows">
              {filteredOrders.map((order, index) => {
                const isSelected = order.id === selectedOrder?.id;
                const code = `CO-${String(index + 1).padStart(3, "0")}`;
                return (
                  <li key={order.id}>
                    <button
                      type="button"
                      className={`co__row${isSelected ? " is-selected" : ""}`}
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      <div className="co__row-main">
                        <div>
                          <span className="co__code">{code}</span>
                          <strong>{order.subject || "Untitled change order"}</strong>
                          {order.description && <p>{order.description}</p>}
                        </div>
                        <span className={`co__status co__status--${statusTone[order.status]}`}>
                          {statusLabel[order.status]}
                        </span>
                      </div>
                      <div className="co__row-meta">
                        <span>{order.recipientName || order.recipientEmail || "No contact"}</span>
                        <span>{formatDateDisplay(order.sentAt) || "Not sent"}</span>
                        <span>{currencyFormatter.format(calculateTotalCost(order.lineItems))}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="co__detail" role="region" aria-live="polite">
          {!project && <div className="co__empty">Select a project to manage change orders.</div>}
          {project && sortedOrders.length === 0 && (
            <div className="co__empty">Create your first change order to get started.</div>
          )}
          {project && sortedOrders.length > 0 && !selectedOrder && (
            <div className="co__empty">Select a change order to see its details.</div>
          )}

          {project && selectedOrder && (
            <>
              <header className="co__detail-header">
                <div>
                  <span className="co__code co__code--solid">
                    {`CO-${String(
                      sortedOrders.findIndex((order) => order.id === selectedOrder.id) + 1,
                    ).padStart(3, "0")}`}
                  </span>
                  <h2>{selectedOrder.subject || "Untitled change order"}</h2>
                  {selectedOrder.description && <p className="co__muted">{selectedOrder.description}</p>}
                </div>
                <span className={`co__status co__status--${statusTone[selectedOrder.status]}`}>
                  {statusLabel[selectedOrder.status]}
                </span>
              </header>

              <div className="co__detail-meta">
                <div>
                  <span>Primary contact</span>
                  <strong>{selectedOrder.recipientName || "—"}</strong>
                  <small>{selectedOrder.recipientEmail || "No email"}</small>
                </div>
                <div>
                  <span>Sent</span>
                  <strong>{formatDateDisplay(selectedOrder.sentAt) || "--"}</strong>
                  {selectedOrder.sentAt && <small>{formatRelativeTime(selectedOrder.sentAt)}</small>}
                </div>
                <div>
                  <span>Last updated</span>
                  <strong>{formatDateDisplay(selectedOrder.updatedAt) || "--"}</strong>
                  {selectedOrder.updatedAt && <small>{formatRelativeTime(selectedOrder.updatedAt)}</small>}
                </div>
                <div>
                  <span>Total value</span>
                  <strong>{currencyFormatter.format(selectedOrderValue)}</strong>
                </div>
              </div>

              <section className="co__card">
                <div className="co__card-head">
                  <h3>Line items</h3>
                  <span>{selectedOrder.lineItems.length} item(s)</span>
                </div>
                {selectedOrder.lineItems.length === 0 ? (
                  <p className="co__muted">No line items added.</p>
                ) : (
                  <div className="co__table">
                    <div className="co__table-row co__table-row--head">
                      <span>Item</span>
                      <span>Description</span>
                      <span>Impact (days)</span>
                      <span>Cost</span>
                    </div>
                    {selectedOrder.lineItems.map((item) => (
                      <div key={item.id} className="co__table-row">
                        <span>{item.title || "-"}</span>
                        <span>{item.description || "-"}</span>
                        <span>{item.impactDays ?? 0}</span>
                        <span>{currencyFormatter.format(Number(item.cost) || 0)}</span>
                      </div>
                    ))}
                    <div className="co__table-row co__table-row--total">
                      <span>Total</span>
                      <span />
                      <span />
                      <span>{currencyFormatter.format(selectedOrderValue)}</span>
                    </div>
                  </div>
                )}
              </section>

              <section className="co__card">
                <div className="co__card-head">
                  <h3>Recipients</h3>
                  <span>{selectedOrder.recipients.length || 0} additional</span>
                </div>
                {selectedOrder.recipients.length === 0 ? (
                  <p className="co__muted">No additional recipients were added.</p>
                ) : (
                  <div className="co__recipient-list">
                    {selectedOrder.recipients.map((recipient) => (
                      <div key={recipient.id} className="co__recipient">
                        <div>
                          <strong>{recipient.name || recipient.email}</strong>
                          <small>{recipient.email}</small>
                        </div>
                        <span className={`co__status co__status--${statusTone[recipient.status]}`}>
                          {recipientStatusLabel[recipient.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {timelineEntries.length > 0 && (
                <section className="co__card">
                  <div className="co__card-head">
                    <h3>Timeline</h3>
                  </div>
                  <ul className="co__timeline">
                    {timelineEntries.map((entry) => {
                      const displayDate = entry.timestamp ? formatDateDisplay(entry.timestamp) : "";
                      const relative = entry.timestamp ? formatRelativeTime(entry.timestamp) : "";
                      return (
                        <li key={entry.id} className={`co__timeline-item co__timeline-item--${entry.tone}`}>
                          <div>
                            <strong>{entry.title}</strong>
                            {entry.description && <p>{entry.description}</p>}
                          </div>
                          {(displayDate || relative) && (
                            <span className="co__muted">
                              {displayDate}
                              {relative ? ` • ${relative}` : ""}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <div className="co__actions">
                {(selectedOrder.status === "pending" || selectedOrder.status === "needs_info") && (
                  <>
                    <button type="button" className="co__primary" onClick={handleApprove} disabled={isActionSubmitting}>
                      Approve
                    </button>
                    <button type="button" className="co__ghost" onClick={handleRequestInfo} disabled={isActionSubmitting}>
                      Request info
                    </button>
                    <button type="button" className="co__danger" onClick={handleDeny} disabled={isActionSubmitting}>
                      Deny
                    </button>
                  </>
                )}
                {selectedOrder.status === "approved" && (
                  <button type="button" className="co__ghost" onClick={handleRequestInfo} disabled={isActionSubmitting}>
                    Ask follow-up
                  </button>
                )}
                <button type="button" className="co__text" onClick={handleDelete} disabled={isActionSubmitting}>
                  Delete
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      {isComposerOpen && project && (
        <div className="co-overlay" role="dialog" aria-modal="true">
          <div className="co-overlay__backdrop" onClick={closeComposer} />
          <div className="co-overlay__panel">
            <button type="button" className="co-overlay__close" aria-label="Close change order composer" onClick={closeComposer}>
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
