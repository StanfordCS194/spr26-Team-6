"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type Notification = {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  rfpId?: string;
  createdAt: number;
  read: boolean;
};

type NotificationContextValue = {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id" | "createdAt" | "read">) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  unreadCount: number;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "1",
      type: "info",
      title: "New Opportunities",
      message: "3 new RFPs match your profile today",
      createdAt: Date.now() - 600000, // 10 minutes ago
      read: false,
    },
    {
      id: "2",
      type: "warning",
      title: "Deadline Approaching",
      message: "Infrastructure Project RFP due in 2 days",
      rfpId: "rfp-123",
      createdAt: Date.now() - 1800000, // 30 minutes ago
      read: false,
    },
    {
      id: "3",
      type: "success",
      title: "Profile Updated",
      message: "Your company profile has been saved",
      createdAt: Date.now() - 3600000, // 1 hour ago
      read: true,
    },
  ]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const addNotification = useCallback(
    (notification: Omit<Notification, "id" | "createdAt" | "read">) => {
      const id = Math.random().toString(36).substring(7);
      setNotifications((prev) => [
        {
          ...notification,
          id,
          createdAt: Date.now(),
          read: false,
        },
        ...prev,
      ]);
      // Auto-remove after 7 seconds if it's an info notification
      if (notification.type === "info") {
        setTimeout(() => removeNotification(id), 7000);
      }
    },
    [],
  );

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
        markAsRead,
        markAllAsRead,
        clearNotifications,
        unreadCount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}
