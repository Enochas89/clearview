import {
  ChangeEvent,
  Dispatch,
  FormEvent,
  SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";
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
  onEdit: (orderId: string, input: ChangeOrderPayload) => Promise<void> | void;
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

const ChangeOrders = ({
  project,
  orders,
  onCreate,
  onEdit,
  onDelete,
  onChangeStatus,
  isLoading = false,
}: ChangeOrdersProps) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isResponseOpen, setIsResponseOpen] = useState(false);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [responseTarget, setResponseTarget] = useState<{
    id: string;
    status: ChangeOrderStatus;
  } | null>(null);

  const [createForm, setCreateForm] = useState<ChangeOrderFormState>(
    () => createEmptyForm(),
  );
  const [editForm, setEditForm] = useState<ChangeOrderFormState>(
    () => createEmptyForm(),
  );
  const [responseMessage, setResponseMessage] = useState("");

  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createTotalCost = useMemo(
    () => calculateTotalCost(createForm.lineItems),
    [createForm.lineItems],
  );
  const editTotalCost = useMemo(
    () => calculateTotalCost(editForm.lineItems),
    [editForm.lineItems],
  );

  useEffect(() => {
    if (!openMenuId) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(`[data-action-menu="${openMenuId}"]`)) {
        setOpenMenuId(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuId]);

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => (a.sentAt > b.sentAt ? -1 : 1)),
    [orders],
  );

  const handleCreateChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setCreateForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
    if (createError) {
      setCreateError(null);
    }
  };

  const handleEditChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setEditForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
    if (editError) {
      setEditError(null);
    }
  };

  const handleLineItemChange = (
  formSetter: Dispatch<SetStateAction<ChangeOrderFormState>>,
    id: string,
    field: keyof ChangeOrderLineItemDraft,
    value: string,
  ) => {
    formSetter((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const addLineItem = (formSetter: Dispatch<SetStateAction<ChangeOrderFormState>>) => {
    formSetter((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, createEmptyLineItemDraft()],
    }));
  };

  const removeLineItem = (
    formSetter: Dispatch<SetStateAction<ChangeOrderFormState>>,
    id: string,
  ) => {
    formSetter((prev) => ({
      ...prev,
      lineItems: prev.lineItems.filter((item) => item.id !== id),
    }));
  };

  const handleRecipientChange = (
    formSetter: Dispatch<SetStateAction<ChangeOrderFormState>>,
    id: string,
    field: keyof ChangeOrderRecipientDraft,
    value: string,
  ) => {
    formSetter((prev) => ({
      ...prev,
      recipients: prev.recipients.map((recipient) =>
        recipient.id === id ? { ...recipient, [field]: value } : recipient,
      ),
    }));
  };

  const addRecipient = (
    formSetter: Dispatch<SetStateAction<ChangeOrderFormState>>,
  ) => {
    formSetter((prev) => ({
      ...prev,
      recipients: [...prev.recipients, createEmptyRecipientDraft()],
    }));
  };

  const removeRecipient = (
    formSetter: Dispatch<SetStateAction<ChangeOrderFormState>>,
    id: string,
  ) => {
    formSetter((prev) => ({
      ...prev,
      recipients:
        prev.recipients.length > 1
          ? prev.recipients.filter((recipient) => recipient.id !== id)
          : prev.recipients,
    }));
  };

  const openCreateModal = () => {
    setCreateForm(createEmptyForm());
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const openEditModal = (order: ChangeOrder) => {
    setEditOrderId(order.id);
    setEditForm({
      subject: order.subject,
      description: order.description,
      recipientName: order.recipientName,
      recipientEmail: order.recipientEmail,
      lineItems:
        order.lineItems.length > 0
          ? order.lineItems.map((item) => ({
              id: item.id || generateId("item"),
              title: item.title,
              description: item.description,
              impactDays:
                item.impactDays || item.impactDays === 0
                  ? String(item.impactDays)
                  : "",
              cost: item.cost || item.cost === 0 ? String(item.cost) : "",
            }))
          : [createEmptyLineItemDraft()],
      recipients:
        order.recipients.length > 0
          ? order.recipients.map((recipient) => ({
              id: recipient.id || generateId("recipient"),
              name: recipient.name ?? "",
              email: recipient.email ?? "",
            }))
          : [createEmptyRecipientDraft()],
    });
    setEditError(null);
    setIsEditOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setCreateError(null);
    setIsSubmitting(false);
  };

  const closeEditModal = () => {
    setIsEditOpen(false);
    setEditOrderId(null);
    setEditError(null);
    setIsSubmitting(false);
  };

  const closeResponseModal = () => {
    setIsResponseOpen(false);
    setResponseTarget(null);
    setResponseMessage("");
    setResponseError(null);
    setIsSubmitting(false);
  };

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!createForm.subject.trim()) {
      setCreateError("Subject is required.");
      return;
    }
    const recipientEmail = createForm.recipientEmail.trim();
    const recipientPayload = buildRecipientPayload(
      createForm.recipientName,
      recipientEmail,
      createForm.recipients,
    );
    if (recipientPayload.length === 0) {
      setCreateError("Add at least one recipient email.");
      return;
    }
    try {
      setIsSubmitting(true);
      const lineItems = pruneLineItems(normalizeLineItems(createForm.lineItems));
      await Promise.resolve(
        onCreate({
          subject: createForm.subject,
          description: createForm.description,
          recipientName: createForm.recipientName,
          recipientEmail,
          lineItems,
          recipients: recipientPayload,
        }),
      );
      closeCreateModal();
    } catch (err: any) {
      console.error("Error creating change order:", err);
      setCreateError(err?.message ?? "Failed to create change order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editOrderId) {
      return;
    }
    if (!editForm.subject.trim()) {
      setEditError("Subject is required.");
      return;
    }
    const recipientEmail = editForm.recipientEmail.trim();
    const recipientPayload = buildRecipientPayload(
      editForm.recipientName,
      recipientEmail,
      editForm.recipients,
    );
    if (recipientPayload.length === 0) {
      setEditError("Add at least one recipient email.");
      return;
    }
    try {
      setIsSubmitting(true);
      const lineItems = pruneLineItems(normalizeLineItems(editForm.lineItems));
      await Promise.resolve(
        onEdit(editOrderId, {
          subject: editForm.subject,
          description: editForm.description,
          recipientName: editForm.recipientName,
          recipientEmail,
          lineItems,
          recipients: recipientPayload,
        }),
      );
      closeEditModal();
    } catch (err: any) {
      console.error("Error updating change order:", err);
      setEditError(err?.message ?? "Failed to update change order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (
    orderId: string,
    status: ChangeOrderStatus,
    message?: string | null,
  ) => {
    try {
      setIsSubmitting(true);
      await Promise.resolve(
        onChangeStatus(orderId, status, { responseMessage: message ?? null }),
      );
      setOpenMenuId(null);
      closeResponseModal();
    } catch (err: any) {
      console.error("Error updating change order status:", err);
      setResponseError(err?.message ?? "Failed to update status.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async (orderId: string) => {
    const shouldDelete =
      typeof window === "undefined"
        ? true
        : window.confirm("Delete this change order?");
    if (!shouldDelete) {
      return;
    }
    try {
      await Promise.resolve(onDelete(orderId));
      setOpenMenuId(null);
    } catch (err) {
      console.error("Error deleting change order:", err);
    }
  };

  const triggerResponseModal = (orderId: string, status: ChangeOrderStatus) => {
    setResponseTarget({ id: orderId, status });
    setResponseMessage("");
    setResponseError(null);
    setIsResponseOpen(true);
  };

  const renderLineItemFields = (
    form: ChangeOrderFormState,
    formSetter: Dispatch<SetStateAction<ChangeOrderFormState>>,
  ) => {
    const total = calculateTotalCost(form.lineItems);
    return (
      <div className="change-order-line-items">
        <div className="change-order-line-items__header">
          <h4>Line items</h4>
          <button
            type="button"
            className="change-order-line-items__add"
          onClick={() => addLineItem(formSetter)}
        >
          Add line item
        </button>
      </div>
      {form.lineItems.map((item, index) => (
        <div key={item.id} className="change-order-line-item">
          <div className="change-order-line-item__field">
            <label>
              Item
              <input
                value={item.title}
                onChange={(event) =>
                  handleLineItemChange(
                    formSetter,
                    item.id,
                    "title",
                    event.target.value,
                  )
                }
                placeholder={`Item ${index + 1}`}
              />
            </label>
          </div>
          <div className="change-order-line-item__field change-order-line-item__field--description">
            <label>
              Description
              <textarea
                value={item.description}
                onChange={(event) =>
                  handleLineItemChange(
                    formSetter,
                    item.id,
                    "description",
                    event.target.value,
                  )
                }
                rows={2}
                placeholder="Explain the change"
              />
            </label>
          </div>
          <div className="change-order-line-item__inline">
            <label>
              Impact (days)
              <input
                type="number"
                min="0"
                step="1"
                value={item.impactDays}
                onChange={(event) =>
                  handleLineItemChange(
                    formSetter,
                    item.id,
                    "impactDays",
                    event.target.value,
                  )
                }
              />
            </label>
            <label>
              Cost
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.cost}
                onChange={(event) =>
                  handleLineItemChange(
                    formSetter,
                    item.id,
                    "cost",
                    event.target.value,
                  )
                }
              />
            </label>
            <button
              type="button"
              className="change-order-line-item__remove"
              onClick={() => removeLineItem(formSetter, item.id)}
              aria-label="Remove line item"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <div className="change-order-line-items__total">
        <span>Total</span>
        <span>{currencyFormatter.format(total)}</span>
      </div>
    </div>
    );
  };

  const renderRecipientFields = (
    form: ChangeOrderFormState,
    formSetter: Dispatch<SetStateAction<ChangeOrderFormState>>,
  ) => (
    <div className="change-order-recipients">
      <div className="change-order-recipients__header">
        <h4>Recipients</h4>
        <button
          type="button"
          className="change-order-recipients__add"
          onClick={() => addRecipient(formSetter)}
        >
          Add recipient
        </button>
      </div>
      {form.recipients.map((recipient) => (
        <div key={recipient.id} className="change-order-recipient-row">
          <label>
            Name
            <input
              type="text"
              value={recipient.name}
              onChange={(event) =>
                handleRecipientChange(
                  formSetter,
                  recipient.id,
                  "name",
                  event.target.value,
                )
              }
              placeholder="Recipient name"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={recipient.email}
              onChange={(event) =>
                handleRecipientChange(
                  formSetter,
                  recipient.id,
                  "email",
                  event.target.value,
                )
              }
              placeholder="recipient@example.com"
              required={form.recipients.length === 1}
            />
          </label>
          <button
            type="button"
            className="change-order-recipient-row__remove"
            onClick={() => removeRecipient(formSetter, recipient.id)}
            aria-label="Remove recipient"
          >
            Remove
          </button>
        </div>
      ))}
      <p className="change-order-recipients__helper">
        Each recipient will receive an email with approval options.
      </p>
    </div>
  );

  return (
    <section className="change-orders">
      <header className="change-orders__header">
        <div>
          <h2>Change Orders</h2>
          <p>Send, track, and approve change requests for this project.</p>
        </div>
        <button type="button" className="change-orders__primary" onClick={openCreateModal}>
          New Change Order
        </button>
      </header>
      <div className="change-orders__context">
        {project ? (
          <span>
            Project: <strong>{project.name}</strong>
          </span>
        ) : (
          <span>Select a project to manage change orders.</span>
        )}
      </div>

      {isLoading ? (
        <p className="change-orders__empty">Loading change orders...</p>
      ) : sortedOrders.length === 0 ? (
        <p className="change-orders__empty">No change orders yet. Create one to get started.</p>
      ) : (
        <ul className="change-orders__list">
          {sortedOrders.map((order) => (
            <li key={order.id} className="change-order-card">
              <div className="change-order-card__header">
                <div>
                  <h3>{order.subject || "Untitled change order"}</h3>
                  <div className="change-order-card__meta">
                    <span>{order.recipients.length} recipient{order.recipients.length === 1 ? "" : "s"}</span>
                    {order.sentAt && (
                      <span title={order.sentAt}>
                        {formatRelativeTime(order.sentAt)
                          ? `Created ${formatRelativeTime(order.sentAt)}`
                          : ""}
                      </span>
                    )}
                  </div>
                  {order.recipientEmail && (
                    <span className="change-order-card__meta-secondary">
                      Primary contact:{" "}
                      {order.recipientName
                        ? `${order.recipientName} (${order.recipientEmail})`
                        : order.recipientEmail}
                    </span>
                  )}
                </div>
                <div
                  className="calendar__post-menu-wrapper"
                  data-action-menu={`change:${order.id}`}
                >
                  <button
                    type="button"
                    className="calendar__post-menu-toggle"
                    aria-haspopup="true"
                    aria-expanded={openMenuId === `change:${order.id}`}
                    aria-label="Show change order actions"
                    onClick={() =>
                      setOpenMenuId((current) =>
                        current === `change:${order.id}` ? null : `change:${order.id}`,
                      )
                    }
                  >
                    &#8230;
                  </button>
                  {openMenuId === `change:${order.id}` && (
                    <div className="calendar__post-menu" role="menu">
                      <button
                        type="button"
                        className="calendar__post-menu-item"
                        role="menuitem"
                        onClick={() => openEditModal(order)}
                      >
                        Edit details
                      </button>
                      <button
                        type="button"
                        className="calendar__post-menu-item calendar__post-menu-item--danger"
                        role="menuitem"
                        onClick={() => confirmDelete(order.id)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {order.description && (
                <p className="change-order-card__description">{order.description}</p>
              )}

              {order.lineItems.length > 0 && (
                <div className="change-order-card__line-items">
                  <div className="change-order-card__line-items-head">
                    <span>Item</span>
                    <span>Description</span>
                    <span>Impact (days)</span>
                    <span>Cost</span>
                  </div>
                  {order.lineItems.map((item) => (
                    <div key={item.id} className="change-order-card__line-item-row">
                      <span>{item.title || "-"}</span>
                      <span>{item.description || "-"}</span>
                      <span>{item.impactDays ?? 0}</span>
                      <span>{currencyFormatter.format(Number(item.cost) || 0)}</span>
                    </div>
                  ))}
                  <div className="change-order-card__line-items-total">
                    <span>Total</span>
                    <span>{currencyFormatter.format(calculateTotalCost(order.lineItems))}</span>
                  </div>
                </div>
              )}

              {order.recipients.length > 0 && (
                <div className="change-order-card__recipients">
                  <div className="change-order-card__recipients-head">
                    <span>Approvers</span>
                  </div>
                  <div className="change-order-card__recipient-list">
                    {order.recipients.map((recipient) => (
                      <div key={recipient.id} className="change-order-card__recipient-row">
                        <div className="change-order-card__recipient-details">
                          <strong>{recipient.name || recipient.email}</strong>
                          <span>{recipient.email}</span>
                        </div>
                        <span className={recipientStatusClass[recipient.status]}>
                          {recipientStatusLabel[recipient.status]}
                        </span>
                        {recipient.conditionNote && (
                          <span className="change-order-card__recipient-note">
                            “{recipient.conditionNote}”
                          </span>
                        )}
                        {recipient.respondedAt && (
                          <span className="change-order-card__recipient-time">
                            {formatRelativeTime(recipient.respondedAt)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="change-order-card__status-row">
                <span className={`change-order-card__badge${statusBadgeClass[order.status]}`}>
                  {statusLabel[order.status]}
                </span>
                <div className="change-order-card__timeline">
                  {order.status !== "pending" && order.responseAt ? (
                    <span title={order.responseAt}>
                      {statusLabel[order.status]}{" "}
                      {formatRelativeTime(order.responseAt)
                        ? formatRelativeTime(order.responseAt)
                        : ""}
                    </span>
                  ) : (
                    <span>Waiting on recipient</span>
                  )}
                  {order.responseMessage && (
                    <span className="change-order-card__note">
                      "{order.responseMessage}"
                    </span>
                  )}
                </div>
              </div>

              <div className="change-order-card__actions">
                {order.status === "pending" && (
                  <>
                    <button
                      type="button"
                      className="change-order-card__action"
                      onClick={() => handleStatusChange(order.id, "approved")}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="change-order-card__action change-order-card__action--danger"
                      onClick={() => handleStatusChange(order.id, "denied")}
                    >
                      Deny
                    </button>
                    <button
                      type="button"
                      className="change-order-card__action change-order-card__action--neutral"
                      onClick={() => triggerResponseModal(order.id, "needs_info")}
                    >
                      Request info
                    </button>
                  </>
                )}
                {order.status === "needs_info" && (
                  <>
                    <button
                      type="button"
                      className="change-order-card__action"
                      onClick={() => handleStatusChange(order.id, "approved")}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="change-order-card__action change-order-card__action--danger"
                      onClick={() => handleStatusChange(order.id, "denied")}
                    >
                      Deny
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isCreateOpen && (
        <div className="modal">
          <div className="modal__backdrop" onClick={closeCreateModal} />
          <div className="modal__dialog" role="dialog" aria-modal="true">
            <form className="modal__form" onSubmit={submitCreate}>
              <header className="modal__header">
                <h3>New change order</h3>
                <button
                  type="button"
                  className="modal__close"
                  onClick={closeCreateModal}
                  aria-label="Close create change order form"
                >
                  X
                </button>
              </header>
              <label>
                Subject
                <input
                  name="subject"
                  value={createForm.subject}
                  onChange={handleCreateChange}
                  placeholder="Describe the change"
                  required
                />
              </label>
              <label>
                Details
                <textarea
                  name="description"
                  rows={4}
                  value={createForm.description}
                  onChange={handleCreateChange}
                  placeholder="Add context, costs, or next steps"
                />
              </label>
              <div className="modal__grid">
                <label>
                  Recipient name
                  <input
                    name="recipientName"
                    value={createForm.recipientName}
                    onChange={handleCreateChange}
                    placeholder="Jordan Smith"
                  />
                </label>
                <label>
                  Recipient email
                  <input
                    name="recipientEmail"
                    type="email"
                    value={createForm.recipientEmail}
                    onChange={handleCreateChange}
                    placeholder="jordan@example.com"
                    required
                  />
                </label>
              </div>
              {renderRecipientFields(createForm, setCreateForm)}
              {renderLineItemFields(createForm, setCreateForm)}
              <div className="change-order-summary">
                <span>Estimated total</span>
                <strong>{currencyFormatter.format(createTotalCost)}</strong>
              </div>
              {createError && <p className="modal__error">{createError}</p>}
              <div className="modal__actions">
                <button type="button" className="modal__secondary" onClick={closeCreateModal}>
                  Cancel
                </button>
                <button type="submit" className="modal__primary" disabled={isSubmitting}>
                  {isSubmitting ? "Sending..." : "Send change order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditOpen && (
        <div className="modal">
          <div className="modal__backdrop" onClick={closeEditModal} />
          <div className="modal__dialog" role="dialog" aria-modal="true">
            <form className="modal__form" onSubmit={submitEdit}>
              <header className="modal__header">
                <h3>Edit change order</h3>
                <button
                  type="button"
                  className="modal__close"
                  onClick={closeEditModal}
                  aria-label="Close edit change order form"
                >
                  X
                </button>
              </header>
              <label>
                Subject
                <input
                  name="subject"
                  value={editForm.subject}
                  onChange={handleEditChange}
                  required
                />
              </label>
              <label>
                Details
                <textarea
                  name="description"
                  rows={4}
                  value={editForm.description}
                  onChange={handleEditChange}
                />
              </label>
              <div className="modal__grid">
                <label>
                  Recipient name
                  <input
                    name="recipientName"
                    value={editForm.recipientName}
                    onChange={handleEditChange}
                  />
                </label>
                <label>
                  Recipient email
                  <input
                    name="recipientEmail"
                    type="email"
                    value={editForm.recipientEmail}
                    onChange={handleEditChange}
                    required
                  />
                </label>
              </div>
              {renderRecipientFields(editForm, setEditForm)}
              {renderLineItemFields(editForm, setEditForm)}
              <div className="change-order-summary">
                <span>Estimated total</span>
                <strong>{currencyFormatter.format(editTotalCost)}</strong>
              </div>
              {editError && <p className="modal__error">{editError}</p>}
              <div className="modal__actions">
                <button type="button" className="modal__secondary" onClick={closeEditModal}>
                  Cancel
                </button>
                <button type="submit" className="modal__primary" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
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
                handleStatusChange(responseTarget.id, responseTarget.status, responseMessage);
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
                  X
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
                <button type="submit" className="modal__primary" disabled={isSubmitting}>
                  {isSubmitting ? "Sending..." : "Send request"}
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
