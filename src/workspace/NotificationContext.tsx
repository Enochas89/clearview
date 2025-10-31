import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type NotificationType = "info" | "success" | "error";

export type AppNotification = {
  id: string;
  type: NotificationType;
  message: string;
};

type NotificationContextValue = {
  notifications: AppNotification[];
  push: (type: NotificationType, message: string) => void;
  dismiss: (id: string) => void;
  clear: () => void;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

const createId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const push = useCallback((type: NotificationType, message: string) => {
    setNotifications((prev) => [...prev, { id: createId(), type, message }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  }, []);

  const clear = useCallback(() => setNotifications([]), []);

  const value = useMemo(
    () => ({
      notifications,
      push,
      dismiss,
      clear,
    }),
    [notifications, push, dismiss, clear],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used inside a NotificationProvider");
  }
  return context;
};

export const NotificationCenter = () => {
  const { notifications, dismiss } = useNotifications();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="notification-center">
      {notifications.map((notification) => (
        <div key={notification.id} className={`notification notification--${notification.type}`}>
          <span>{notification.message}</span>
          <button type="button" className="notification__close" onClick={() => dismiss(notification.id)}>
            &times;
          </button>
        </div>
      ))}
    </div>
  );
};
