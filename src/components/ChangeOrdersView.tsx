import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ChangeOrder,
  ChangeOrderDraft,
  ChangeOrderStatus,
  ClientProfile,
  ClientContact,
  Project,
} from "../types";

type ChangeOrdersViewProps = {
  project: Project | null;
  clientProfile: ClientProfile | null;
  clientContacts: ClientContact[];
  changeOrders: ChangeOrder[];
  canEditClientProfile: boolean;
  canSubmitChangeOrders: boolean;
  canReviewChangeOrders: boolean;
  onSaveClientProfile: (
    projectId: string,
    input: {
      companyName: string;
      contactName: string;
      contactEmail: string;
      contactPhone: string;
      address: string;
    }
  ) => Promise<void> | void;
  onDeleteClientProfile: (projectId: string) => Promise<boolean | undefined> | boolean | undefined;
  onCreateClientContact: (
    projectId: string,
    input: { fullName: string; email: string; phone?: string | null; role?: string | null }
  ) => Promise<ClientContact | undefined> | ClientContact | undefined;
  onUpdateClientContact: (
    contactId: string,
    input: { fullName: string; email: string; phone?: string | null; role?: string | null }
  ) => Promise<boolean | undefined> | boolean | undefined;
  onDeleteClientContact: (contactId: string) => Promise<boolean | undefined> | boolean | undefined;
  onCreateChangeOrder: (input: ChangeOrderDraft) => Promise<void> | void;
  onSendChangeOrder: (changeOrderId: string, options?: { email?: string | null }) => Promise<void> | void;
  onDeleteChangeOrder: (changeOrderId: string) => Promise<boolean | undefined> | boolean | undefined;
  onUpdateChangeOrderStatus: (
    changeOrderId: string,
    status: ChangeOrderStatus,
    notes?: string
  ) => Promise<void> | void;
};

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${Number(value ?? 0).toFixed(0)}`;
  }
};

const formatDate = (date: string | null | undefined) => {
  if (!date) return "--";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "--";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatDuration = (startIso: string, endIso: string | null | undefined) => {
  if (!endIso) {
    return "Awaiting response";
  }
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return "--";
  }

  const diffMinutes = Math.round((end - start) / 60000);
  if (diffMinutes < 60) {
    return `${diffMinutes} min`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr`;
  }
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"}`;
};

const ChangeOrdersView = ({
  project,
  clientProfile,
  clientContacts,
  changeOrders,
  canEditClientProfile,
  canSubmitChangeOrders,
  canReviewChangeOrders,
  onSaveClientProfile,
  onDeleteClientProfile,
  onCreateClientContact,
  onUpdateClientContact,
  onDeleteClientContact,
  onCreateChangeOrder,
  onSendChangeOrder,
  onDeleteChangeOrder,
  onUpdateChangeOrderStatus,
}: ChangeOrdersViewProps) => {
  const [clientForm, setClientForm] = useState({
    companyName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
  });
  const [isEditingClient, setIsEditingClient] = useState(!clientProfile);
  const [savingClient, setSavingClient] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);
  const [contactDraft, setContactDraft] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "",
  });
  const [contactEditor, setContactEditor] = useState<{
    id: string;
    fullName: string;
    email: string;
    phone: string;
    role: string;
  } | null>(null);
  const [savingContactId, setSavingContactId] = useState<string | "new" | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const [contactFeedback, setContactFeedback] = useState<string | null>(null);
  const [sendRecipientId, setSendRecipientId] = useState<string | null>(null);

  const [changeOrderForm, setChangeOrderForm] = useState({
    title: "",
    description: "",
    amount: "",
    dueDate: "",
  });
  const [submittingOrder, setSubmittingOrder] = useState(false);

  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [processingDecision, setProcessingDecision] = useState<string | null>(null);
  const [sendingOrderId, setSendingOrderId] = useState<string | null>(null);
  const [sendMessages, setSendMessages] = useState<Record<string, string>>({});
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  const PROFILE_RECIPIENT_ID = "__profile__";

  useEffect(() => {
    if (clientProfile) {
      setClientForm({
        companyName: clientProfile.companyName,
        contactName: clientProfile.contactName,
        contactEmail: clientProfile.contactEmail,
        contactPhone: clientProfile.contactPhone,
        address: clientProfile.address,
      });
      setIsEditingClient(false);
    } else {
      setIsEditingClient(true);
      setClientForm({
        companyName: "",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        address: "",
      });
    }
  }, [clientProfile]);

  useEffect(() => {
    if (clientContacts.length > 0) {
      if (
        !sendRecipientId ||
        (sendRecipientId !== PROFILE_RECIPIENT_ID &&
          !clientContacts.some((contact) => contact.id === sendRecipientId))
      ) {
        setSendRecipientId(clientContacts[0].id);
      }
      return;
    }

    const profileEmail = clientProfile?.contactEmail?.trim() ?? "";
    if (profileEmail) {
      if (sendRecipientId !== PROFILE_RECIPIENT_ID) {
        setSendRecipientId(PROFILE_RECIPIENT_ID);
      }
    } else if (sendRecipientId !== null) {
      setSendRecipientId(null);
    }
  }, [clientContacts, clientProfile?.contactEmail, sendRecipientId]);

  const sortedChangeOrders = useMemo(() => {
    return [...changeOrders].sort((a, b) => {
      const left = new Date(a.requestedAt).getTime();
      const right = new Date(b.requestedAt).getTime();
      return right - left;
    });
  }, [changeOrders]);

  const selectedRecipient = useMemo(() => {
    if (!sendRecipientId || sendRecipientId === PROFILE_RECIPIENT_ID) {
      return null;
    }
    return clientContacts.find((contact) => contact.id === sendRecipientId) ?? null;
  }, [clientContacts, sendRecipientId]);

  const resolvedRecipientEmail = useMemo(() => {
    if (selectedRecipient?.email?.trim()) {
      return selectedRecipient.email.trim();
    }
    if (sendRecipientId === PROFILE_RECIPIENT_ID) {
      return clientProfile?.contactEmail?.trim() ?? "";
    }
    return "";
  }, [clientProfile?.contactEmail, selectedRecipient, sendRecipientId]);

  const resolvedRecipientLabel = useMemo(() => {
    if (selectedRecipient) {
      const role = selectedRecipient.role?.trim();
      return role && role.length > 0
        ? `${selectedRecipient.fullName} (${role})`
        : selectedRecipient.fullName;
    }
    if (sendRecipientId === PROFILE_RECIPIENT_ID) {
      return clientProfile?.contactName?.trim() || clientProfile?.contactEmail?.trim() || "";
    }
    return "";
  }, [clientProfile?.contactEmail, clientProfile?.contactName, selectedRecipient, sendRecipientId]);

  const canManageClientContacts = canSubmitChangeOrders;

  const responseStats = useMemo(() => {
    const completed = changeOrders.filter((order) => order.decisionAt);
    if (completed.length === 0) {
      return {
        averageResponseMinutes: null as number | null,
        completedCount: 0,
      };
    }
    const totalMinutes = completed.reduce((acc, order) => {
      const start = new Date(order.requestedAt).getTime();
      const end = new Date(order.decisionAt ?? "").getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return acc;
      }
      return acc + Math.round((end - start) / 60000);
    }, 0);

    const average = totalMinutes > 0 ? Math.round(totalMinutes / completed.length) : null;
    return {
      averageResponseMinutes: average,
      completedCount: completed.length,
    };
  }, [changeOrders]);

  const handleSendChangeOrder = async (orderId: string) => {
    if (!resolvedRecipientEmail) {
      setSendMessages((prev) => ({
        ...prev,
        [orderId]: "Add a client recipient before sending.",
      }));
      return;
    }

    try {
      setSendingOrderId(orderId);
      setSendMessages((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      await onSendChangeOrder(orderId, { email: resolvedRecipientEmail });
      const recipientMessage =
        resolvedRecipientLabel && resolvedRecipientLabel.length > 0
          ? `Delivery email sent to ${resolvedRecipientLabel}.`
          : "Delivery email sent to client.";
      setSendMessages((prev) => ({
        ...prev,
        [orderId]: recipientMessage,
      }));
    } catch (err: any) {
      setSendMessages((prev) => ({
        ...prev,
        [orderId]: err?.message ?? "Failed to send change order.",
      }));
    } finally {
      setSendingOrderId(null);
    }
  };

  const handleDeleteChangeOrderClick = async (orderId: string) => {
    if (!canSubmitChangeOrders || deletingOrderId === orderId) {
      return;
    }

    const confirmed = window.confirm("Delete this change order? This action cannot be undone.");
    if (!confirmed) {
      return;
    }

    setDeletingOrderId(orderId);
    try {
      const deleted = await onDeleteChangeOrder(orderId);
      if (!deleted) {
        setSendMessages((prev) => ({
          ...prev,
          [orderId]: "Failed to delete change order.",
        }));
      }
    } finally {
      setDeletingOrderId(null);
    }
  };

  if (!project) {
    return (
      <section className="change-orders">
        <header className="change-orders__header">
          <div className="change-orders__title">
            <h2>Change Orders</h2>
            <span className="change-orders__badge">BETA</span>
          </div>
        </header>
        <p className="change-orders__placeholder">
          Select a project to manage change orders.
        </p>
      </section>
    );
  }

  const handleClientSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingClient || !canEditClientProfile) {
      return;
    }
    setSavingClient(true);
    try {
      await onSaveClientProfile(project.id, clientForm);
      setIsEditingClient(false);
    } finally {
      setSavingClient(false);
    }
  };

  const handleDeleteClientProfileClick = async () => {
    if (!project || !clientProfile || !canEditClientProfile || deletingClient) {
      return;
    }

    const confirmed = window.confirm(
      "Delete the client profile for this project? This will remove all saved client details."
    );
    if (!confirmed) {
      return;
    }

    setDeletingClient(true);
    setContactFeedback(null);
    try {
      const deleted = await onDeleteClientProfile(project.id);
      if (!deleted) {
        setContactFeedback("Failed to delete client profile.");
        return;
      }
      setClientForm({
        companyName: "",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        address: "",
      });
      setIsEditingClient(true);
      setSendRecipientId(null);
      setContactFeedback("Client profile deleted.");
    } finally {
      setDeletingClient(false);
    }
  };

  const handleAddContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!project || !canManageClientContacts || savingContactId === "new") {
      return;
    }

    const fullName = contactDraft.fullName.trim();
    const email = contactDraft.email.trim();
    const phone = contactDraft.phone.trim();
    const role = contactDraft.role.trim();

    if (!fullName || !email) {
      setContactFeedback("Client contacts need a name and email.");
      return;
    }

    setSavingContactId("new");
    setContactFeedback(null);
    try {
      const created = await onCreateClientContact(project.id, {
        fullName,
        email,
        phone: phone.length > 0 ? phone : null,
        role: role.length > 0 ? role : null,
      });
      if (!created) {
        setContactFeedback("Failed to add contact.");
        return;
      }
      setContactDraft({
        fullName: "",
        email: "",
        phone: "",
        role: "",
      });
      setContactFeedback("Contact added.");
    } catch (err: any) {
      setContactFeedback(err?.message ?? "Failed to add contact.");
    } finally {
      setSavingContactId(null);
    }
  };

  const beginEditingContact = (contact: ClientContact) => {
    setContactFeedback(null);
    setContactEditor({
      id: contact.id,
      fullName: contact.fullName,
      email: contact.email,
      phone: contact.phone ?? "",
      role: contact.role ?? "",
    });
  };

  const handleCancelContactEdit = () => {
    setContactEditor(null);
  };

  const handleSaveContactEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contactEditor || !project || !canManageClientContacts || savingContactId === contactEditor.id) {
      return;
    }

    const fullName = contactEditor.fullName.trim();
    const email = contactEditor.email.trim();
    const phone = contactEditor.phone.trim();
    const role = contactEditor.role.trim();

    if (!fullName || !email) {
      setContactFeedback("Client contacts need a name and email.");
      return;
    }

    setSavingContactId(contactEditor.id);
    setContactFeedback(null);
    try {
      await onUpdateClientContact(contactEditor.id, {
        fullName,
        email,
        phone: phone.length > 0 ? phone : null,
        role: role.length > 0 ? role : null,
      });
      setContactEditor(null);
      setContactFeedback("Contact updated.");
    } catch (err: any) {
      setContactFeedback(err?.message ?? "Failed to update contact.");
    } finally {
      setSavingContactId(null);
    }
  };

  const handleRemoveContact = async (contactId: string) => {
    if (!canManageClientContacts || deletingContactId === contactId) {
      return;
    }

    setDeletingContactId(contactId);
    setContactFeedback(null);
    try {
      await onDeleteClientContact(contactId);
      if (contactEditor?.id === contactId) {
        setContactEditor(null);
      }
      setContactFeedback("Contact removed.");
    } catch (err: any) {
      setContactFeedback(err?.message ?? "Failed to remove contact.");
    } finally {
      setDeletingContactId(null);
    }
  };

  const handleCreateChangeOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmitChangeOrders || submittingOrder) {
      return;
    }
    const trimmedTitle = changeOrderForm.title.trim();
    if (!trimmedTitle) {
      return;
    }

    setSubmittingOrder(true);
    try {
      await onCreateChangeOrder({
        projectId: project.id,
        title: trimmedTitle,
        description: changeOrderForm.description.trim(),
        amount: changeOrderForm.amount ? Number(changeOrderForm.amount) : null,
        dueDate: changeOrderForm.dueDate || undefined,
      });
      setChangeOrderForm({
        title: "",
        description: "",
        amount: "",
        dueDate: "",
      });
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleDecision = async (orderId: string, status: ChangeOrderStatus) => {
    if (!canReviewChangeOrders || processingDecision) {
      return;
    }
    setProcessingDecision(orderId);
    try {
      await onUpdateChangeOrderStatus(orderId, status, decisionNotes[orderId]);
      setDecisionNotes((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } finally {
      setProcessingDecision(null);
    }
  };

  const averageResponseLabel =
    responseStats.averageResponseMinutes === null
      ? "No responses yet"
      : responseStats.averageResponseMinutes < 60
      ? `${responseStats.averageResponseMinutes} min avg response`
      : responseStats.averageResponseMinutes < 60 * 24
      ? `${Math.round(responseStats.averageResponseMinutes / 60)} hr avg response`
      : `${Math.round(responseStats.averageResponseMinutes / (60 * 24))} day avg response`;

  return (
    <section className="change-orders">
      <header className="change-orders__header">
        <div>
          <div className="change-orders__title">
            <h2>Change Orders</h2>
            <span className="change-orders__badge">BETA</span>
          </div>
          <p>Track client approvals and turnaround time.</p>
        </div>
        <div className="change-orders__stats">
          <span>
            {sortedChangeOrders.filter((order) => order.status === "pending").length} pending
          </span>
          <span>{averageResponseLabel}</span>
        </div>
      </header>

      <div className="change-orders__grid">
        <section className="change-orders__panel">
          <header>
            <div className="change-orders__panel-title">
              <h3>Client Information</h3>
            </div>
            {clientProfile && canEditClientProfile && (
              <div className="change-orders__panel-actions">
                <button
                  type="button"
                  className="change-orders__link"
                  onClick={() => setIsEditingClient((value) => !value)}
                  disabled={deletingClient}
                >
                  {isEditingClient ? "Cancel" : "Edit"}
                </button>
                <button
                  type="button"
                  className="change-orders__danger change-orders__danger--outline"
                  onClick={handleDeleteClientProfileClick}
                  disabled={deletingClient || savingClient}
                >
                  {deletingClient ? "Deleting..." : "Delete client"}
                </button>
              </div>
            )}
          </header>
          {(!clientProfile || (isEditingClient && canEditClientProfile)) ? (
            <form className="change-orders__form" onSubmit={handleClientSubmit}>
              <label>
                Company name
                <input
                  type="text"
                  value={clientForm.companyName}
                  onChange={(event) =>
                    setClientForm((prev) => ({ ...prev, companyName: event.target.value }))
                  }
                  required
                  disabled={!canEditClientProfile || savingClient}
                />
              </label>
              <label>
                Primary contact
                <input
                  type="text"
                  value={clientForm.contactName}
                  onChange={(event) =>
                    setClientForm((prev) => ({ ...prev, contactName: event.target.value }))
                  }
                  required
                  disabled={!canEditClientProfile || savingClient}
                />
              </label>
              <label>
                Contact email
                <input
                  type="email"
                  value={clientForm.contactEmail}
                  onChange={(event) =>
                    setClientForm((prev) => ({ ...prev, contactEmail: event.target.value }))
                  }
                  required
                  disabled={!canEditClientProfile || savingClient}
                />
              </label>
              <label>
                Contact phone
                <input
                  type="tel"
                  value={clientForm.contactPhone}
                  onChange={(event) =>
                    setClientForm((prev) => ({ ...prev, contactPhone: event.target.value }))
                  }
                  placeholder="(555) 123-4567"
                  disabled={!canEditClientProfile || savingClient}
                />
              </label>
              <label>
                Mailing address
                <textarea
                  value={clientForm.address}
                  onChange={(event) =>
                    setClientForm((prev) => ({ ...prev, address: event.target.value }))
                  }
                  rows={3}
                  disabled={!canEditClientProfile || savingClient}
                />
              </label>
              {canEditClientProfile ? (
                <button
                  type="submit"
                  className="change-orders__primary"
                  disabled={savingClient}
                >
                  {savingClient ? "Saving..." : "Save client profile"}
                </button>
              ) : null}
            </form>
          ) : clientProfile ? (
            <dl className="change-orders__details">
              <div>
                <dt>Company</dt>
                <dd>{clientProfile.companyName}</dd>
              </div>
              <div>
                <dt>Primary contact</dt>
                <dd>{clientProfile.contactName}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{clientProfile.contactEmail}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{clientProfile.contactPhone || "--"}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{clientProfile.address || "--"}</dd>
              </div>
            </dl>
          ) : null}

          <div className="change-orders__contacts">
            <div className="change-orders__contacts-header">
              <h4>Client contacts</h4>
              {contactFeedback && (
                <span className="change-orders__note change-orders__note--inline">{contactFeedback}</span>
              )}
            </div>
            {canManageClientContacts ? (
              <form className="change-orders__form change-orders__contact-form" onSubmit={handleAddContact}>
                <div className="change-orders__form-row">
                  <label>
                    Name
                    <input
                      type="text"
                      value={contactDraft.fullName}
                      onChange={(event) =>
                        setContactDraft((prev) => ({ ...prev, fullName: event.target.value }))
                      }
                      required
                      disabled={savingContactId === "new"}
                    />
                  </label>
                  <label>
                    Role
                    <input
                      type="text"
                      value={contactDraft.role}
                      onChange={(event) =>
                        setContactDraft((prev) => ({ ...prev, role: event.target.value }))
                      }
                      placeholder="Owner, Designer, etc."
                      disabled={savingContactId === "new"}
                    />
                  </label>
                </div>
                <div className="change-orders__form-row">
                  <label>
                    Email
                    <input
                      type="email"
                      value={contactDraft.email}
                      onChange={(event) =>
                        setContactDraft((prev) => ({ ...prev, email: event.target.value }))
                      }
                      required
                      disabled={savingContactId === "new"}
                    />
                  </label>
                  <label>
                    Phone
                    <input
                      type="tel"
                      value={contactDraft.phone}
                      onChange={(event) =>
                        setContactDraft((prev) => ({ ...prev, phone: event.target.value }))
                      }
                      placeholder="(555) 123-4567"
                      disabled={savingContactId === "new"}
                    />
                  </label>
                </div>
                <div className="change-orders__actions">
                  <button
                    type="submit"
                    className="change-orders__primary"
                    disabled={savingContactId === "new"}
                  >
                    {savingContactId === "new" ? "Adding..." : "Add contact"}
                  </button>
                </div>
              </form>
            ) : (
              <p className="change-orders__note">Only project editors or owners can manage contacts.</p>
            )}
            {clientContacts.length > 0 ? (
              <ul className="change-orders__contact-list">
                {clientContacts.map((contact) => {
                  const isEditing = contactEditor?.id === contact.id;
                  return (
                    <li key={contact.id} className="change-orders__contact-card">
                      {isEditing ? (
                        <form className="change-orders__form change-orders__contact-edit" onSubmit={handleSaveContactEdit}>
                          <div className="change-orders__contact-grid">
                            <label>
                              Name
                              <input
                                type="text"
                                value={contactEditor.fullName}
                                onChange={(event) =>
                                  setContactEditor((prev) =>
                                    prev ? { ...prev, fullName: event.target.value } : prev
                                  )
                                }
                                required
                                disabled={savingContactId === contact.id}
                              />
                            </label>
                            <label>
                              Role
                              <input
                                type="text"
                                value={contactEditor.role}
                                onChange={(event) =>
                                  setContactEditor((prev) =>
                                    prev ? { ...prev, role: event.target.value } : prev
                                  )
                                }
                                placeholder="Owner, Designer, etc."
                                disabled={savingContactId === contact.id}
                              />
                            </label>
                          </div>
                          <div className="change-orders__contact-grid">
                            <label>
                              Email
                              <input
                                type="email"
                                value={contactEditor.email}
                                onChange={(event) =>
                                  setContactEditor((prev) =>
                                    prev ? { ...prev, email: event.target.value } : prev
                                  )
                                }
                                required
                                disabled={savingContactId === contact.id}
                              />
                            </label>
                            <label>
                              Phone
                              <input
                                type="tel"
                                value={contactEditor.phone}
                                onChange={(event) =>
                                  setContactEditor((prev) =>
                                    prev ? { ...prev, phone: event.target.value } : prev
                                  )
                                }
                                placeholder="(555) 123-4567"
                                disabled={savingContactId === contact.id}
                              />
                            </label>
                          </div>
                          <div className="change-orders__contact-actions">
                            <button
                              type="button"
                              className="change-orders__link"
                              onClick={handleCancelContactEdit}
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="change-orders__primary"
                              disabled={savingContactId === contact.id}
                            >
                              {savingContactId === contact.id ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="change-orders__contact-body">
                          <div className="change-orders__contact-heading">
                            <strong>{contact.fullName}</strong>
                            {contact.role && contact.role.length > 0 ? (
                              <span className="change-orders__contact-role">{contact.role}</span>
                            ) : null}
                          </div>
                          <div className="change-orders__contact-meta">
                            <span>{contact.email}</span>
                            {contact.phone ? <span>{contact.phone}</span> : null}
                          </div>
                          {canManageClientContacts ? (
                            <div className="change-orders__contact-actions">
                              <button
                                type="button"
                                className="change-orders__link"
                                onClick={() => beginEditingContact(contact)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="change-orders__danger"
                                onClick={() => handleRemoveContact(contact.id)}
                                disabled={deletingContactId === contact.id}
                              >
                                {deletingContactId === contact.id ? "Removing..." : "Remove"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="change-orders__placeholder">No client contacts yet.</p>
            )}
            <div className="change-orders__recipient">
              <label>
                Send change orders to
                <select
                  value={sendRecipientId ?? ""}
                  onChange={(event) => setSendRecipientId(event.target.value || null)}
                  disabled={
                    !canSubmitChangeOrders ||
                    (clientContacts.length === 0 && !(clientProfile?.contactEmail?.trim()))
                  }
                >
                  {clientContacts.map((contact) => {
                    const role = contact.role?.trim();
                    const label =
                      role && role.length > 0 ? `${contact.fullName} • ${role}` : contact.fullName;
                    return (
                      <option key={contact.id} value={contact.id}>
                        {label}
                      </option>
                    );
                  })}
                  {clientProfile?.contactEmail?.trim() ? (
                    <option value={PROFILE_RECIPIENT_ID}>
                      {clientProfile.contactName?.trim()
                        ? `${clientProfile.contactName} • ${clientProfile.contactEmail}`
                        : clientProfile.contactEmail}
                    </option>
                  ) : null}
                </select>
              </label>
              {resolvedRecipientLabel ? (
                <p className="change-orders__note">
                  Emails will route to {resolvedRecipientLabel}.
                </p>
              ) : (
                <p className="change-orders__note">Add a contact to enable client delivery.</p>
              )}
            </div>
          </div>
        </section>

        <section className="change-orders__panel">
          <header>
            <h3>Create change order</h3>
          </header>
          {canSubmitChangeOrders ? (
            <form className="change-orders__form" onSubmit={handleCreateChangeOrder}>
              <label>
                Title
                <input
                  type="text"
                  value={changeOrderForm.title}
                  onChange={(event) =>
                    setChangeOrderForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  required
                  placeholder="HVAC revisions, upgraded finishes, etc."
                  disabled={submittingOrder}
                />
              </label>
              <label>
                Description
                <textarea
                  value={changeOrderForm.description}
                  onChange={(event) =>
                    setChangeOrderForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  rows={3}
                  placeholder="Outline the scope of the requested change."
                  disabled={submittingOrder}
                />
              </label>
              <div className="change-orders__form-row">
                <label>
                  Estimated cost
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={changeOrderForm.amount}
                    onChange={(event) =>
                      setChangeOrderForm((prev) => ({
                        ...prev,
                        amount: event.target.value,
                      }))
                    }
                    placeholder="5000"
                    disabled={submittingOrder}
                  />
                </label>
                <label>
                  Client response due
                  <input
                    type="date"
                    value={changeOrderForm.dueDate}
                    onChange={(event) =>
                      setChangeOrderForm((prev) => ({
                        ...prev,
                        dueDate: event.target.value,
                      }))
                    }
                    disabled={submittingOrder}
                  />
                </label>
              </div>
              <button
                type="submit"
                className="change-orders__primary"
                disabled={submittingOrder}
              >
                {submittingOrder ? "Submitting..." : "Submit change order"}
              </button>
            </form>
          ) : (
            <p className="change-orders__placeholder">
              You do not have permissions to submit change orders for this project.
            </p>
          )}
        </section>
      </div>

      <section className="change-orders__list">
        <header>
          <h3>Requests</h3>
          <span>{sortedChangeOrders.length} total</span>
        </header>
        {sortedChangeOrders.length === 0 ? (
          <p className="change-orders__placeholder">
            No change orders yet. Capture scope changes and approvals here to keep everyone aligned.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Amount</th>
                <th scope="col">Submitted</th>
                <th scope="col">Delivery</th>
                <th scope="col">Client response</th>
                <th scope="col">Status</th>
                {(canSubmitChangeOrders || canReviewChangeOrders) ? (
                  <th scope="col" aria-label="Actions" />
                ) : null}
              </tr>
            </thead>
            <tbody>
              {sortedChangeOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <div className="change-orders__title">{order.title}</div>
                    {order.description && (
                      <p className="change-orders__description">{order.description}</p>
                    )}
                    {order.dueDate && (
                      <p className="change-orders__note">
                        Requested response by {formatDate(order.dueDate)}
                      </p>
                    )}
                  </td>
                  <td>{formatCurrency(order.amount)}</td>
                  <td>{formatDate(order.requestedAt)}</td>
                  <td>
                    <div className="change-orders__delivery">
                      <span>
                        {order.clientLastSentAt
                          ? `Sent ${formatDateTime(order.clientLastSentAt)}`
                          : "Not sent"}
                      </span>
                      {order.clientViewTokenExpiresAt && (
                        <p className="change-orders__note">
                          Link expires {formatDateTime(order.clientViewTokenExpiresAt)}
                        </p>
                      )}
                    </div>
                  </td>
                  <td>{formatDuration(order.requestedAt, order.decisionAt)}</td>
                  <td>
                    <span className={`change-orders__status change-orders__status--${order.status}`}>
                      {order.status === "pending"
                        ? "Pending"
                        : order.status === "approved"
                        ? "Approved"
                        : "Denied"}
                    </span>
                    {order.decisionNotes && (
                      <p className="change-orders__note">{order.decisionNotes}</p>
                    )}
                    {order.clientDecisionNotes && (
                      <p className="change-orders__note">
                        Client notes: {order.clientDecisionNotes}
                      </p>
                    )}
                    {order.clientSignedName && (
                      <p className="change-orders__note">
                        Signed by {order.clientSignedName}
                        {order.clientSignedAt ? ` on ${formatDateTime(order.clientSignedAt)}` : ""}
                      </p>
                    )}
                    {order.clientSignatureUrl && (
                      <p className="change-orders__note">
                        <a
                          href={order.clientSignatureUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View signature
                        </a>
                      </p>
                    )}
                  </td>
                  {(canSubmitChangeOrders || canReviewChangeOrders) ? (
                    <td>
                      {canSubmitChangeOrders && (
                        <div className="change-orders__actions">
                          <button
                            type="button"
                            className="change-orders__secondary"
                            onClick={() => handleSendChangeOrder(order.id)}
                            disabled={
                              sendingOrderId === order.id ||
                              deletingOrderId === order.id ||
                              !resolvedRecipientEmail
                            }
                          >
                            {sendingOrderId === order.id
                              ? "Sending..."
                              : order.clientLastSentAt
                              ? "Resend to client"
                              : "Send to client"}
                          </button>
                          <button
                            type="button"
                            className="change-orders__danger change-orders__danger--outline"
                            onClick={() => handleDeleteChangeOrderClick(order.id)}
                            disabled={deletingOrderId === order.id || sendingOrderId === order.id}
                          >
                            {deletingOrderId === order.id ? "Deleting..." : "Delete change order"}
                          </button>
                          {resolvedRecipientLabel && (
                            <p className="change-orders__note change-orders__note--muted">
                              Current recipient: {resolvedRecipientLabel}
                            </p>
                          )}
                          {sendMessages[order.id] && (
                            <p className="change-orders__note">{sendMessages[order.id]}</p>
                          )}
                        </div>
                      )}
                      {canReviewChangeOrders && (
                        <>
                          {order.status === "pending" ? (
                            <div className="change-orders__actions">
                              <textarea
                                rows={2}
                                placeholder="Internal notes (optional)"
                                value={decisionNotes[order.id] ?? ""}
                                onChange={(event) =>
                                  setDecisionNotes((prev) => ({
                                    ...prev,
                                    [order.id]: event.target.value,
                                  }))
                                }
                              />
                              <div className="change-orders__action-buttons">
                                <button
                                  type="button"
                                  className="change-orders__primary"
                                  onClick={() => handleDecision(order.id, "approved")}
                                  disabled={processingDecision === order.id}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="change-orders__danger"
                                  onClick={() => handleDecision(order.id, "denied")}
                                  disabled={processingDecision === order.id}
                                >
                                  Deny
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="change-orders__link"
                              onClick={() => handleDecision(order.id, "pending")}
                              disabled={processingDecision === order.id}
                            >
                              Mark as pending
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
};

export default ChangeOrdersView;

