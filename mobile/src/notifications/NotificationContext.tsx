import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type NotificationType = 'info' | 'success' | 'error';

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

const generateId = () => `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;

type TimerHandle = ReturnType<typeof setTimeout>;

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const timers = useRef(new Map<string, TimerHandle>());

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const clear = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    setNotifications([]);
  }, []);

  const push = useCallback(
    (type: NotificationType, message: string) => {
      const id = generateId();
      setNotifications((prev) => [...prev, { id, type, message }]);
      const timeout = setTimeout(() => dismiss(id), 4500);
      timers.current.set(id, timeout);
    },
    [dismiss],
  );

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
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

const TYPE_STYLES: Record<NotificationType, keyof typeof styles> = {
  info: 'toastInfo',
  success: 'toastSuccess',
  error: 'toastError',
};

export const NotificationCenter = () => {
  const { notifications, dismiss } = useNotifications();
  const insets = useSafeAreaInsets();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {notifications.map((notification) => (
        <View key={notification.id} style={[styles.toast, styles[TYPE_STYLES[notification.type]]]}>
          <Text style={styles.message}>{notification.message}</Text>
          <TouchableOpacity accessibilityLabel="Dismiss notification" onPress={() => dismiss(notification.id)}>
            <Text style={styles.dismiss}>×</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: 16,
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  toastInfo: {
    backgroundColor: '#dbeafe',
  },
  toastSuccess: {
    backgroundColor: '#dcfce7',
  },
  toastError: {
    backgroundColor: '#fee2e2',
  },
  message: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    marginRight: 12,
  },
  dismiss: {
    fontSize: 18,
    color: '#0f172a',
    paddingHorizontal: 6,
  },
});
