"use client";

import { useNotifications } from "@/context/NotificationContext";
import { useEffect, useState } from "react";
import { NotificationSkeleton } from "./Skeletons";

function CheckCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4L12 14.01l-3-3" />
    </svg>
  );
}

function AlertCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function NotificationPanel() {
  const {
    notifications,
    removeNotification,
    markAsRead,
    markAllAsRead,
    unreadCount,
  } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    if (isOpen) window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const getNotificationStyles = (type: string) => {
    switch (type) {
      case "success":
        return { icon: CheckCircleIcon, bg: "bg-green-50", text: "text-green-700", border: "border-green-200" };
      case "warning":
        return { icon: AlertCircleIcon, bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" };
      case "error":
        return { icon: AlertCircleIcon, bg: "bg-red-50", text: "text-red-700", border: "border-red-200" };
      default:
        return { icon: InfoIcon, bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" };
    }
  };

  return (
    <>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="notification-panel"
        className="relative flex size-10 items-center justify-center rounded-lg text-govbid-text-muted transition hover:bg-govbid-primary-muted/60 hover:text-govbid-text"
        title="Notifications"
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ""}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 14h18c0-7-3-7-3-14" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-30 bg-black/20"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <div
            id="notification-panel"
            className="absolute right-0 top-12 z-40 w-96 max-w-[calc(100vw-1rem)] rounded-xl border border-govbid-border bg-govbid-surface shadow-lg"
          >
            {/* Header */}
            <div className="border-b border-govbid-border p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-govbid-text">Notifications</h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs font-medium text-govbid-primary transition hover:text-govbid-primary-dark"
                    >
                      Mark all as read
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-govbid-text-muted transition hover:text-govbid-text"
                    aria-label="Close"
                  >
                    <XIcon />
                  </button>
                </div>
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-govbid-text-muted">No notifications</p>
                </div>
              ) : (
                notifications.map((notification) => {
                  const styles = getNotificationStyles(notification.type);
                  const Icon = styles.icon;
                  return (
                    <div
                      key={notification.id}
                      className={`border-b border-govbid-border p-4 transition ${
                        !notification.read ? "bg-govbid-primary-muted/30" : ""
                      }`}
                      onClick={() => {
                        if (!notification.read) markAsRead(notification.id);
                      }}
                    >
                      <div className="flex gap-3">
                        <div className={`flex-shrink-0 ${styles.text}`}>
                          <Icon />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-govbid-text">
                            {notification.title}
                          </p>
                          <p className="mt-1 text-sm text-govbid-text-muted">
                            {notification.message}
                          </p>
                          <p className="mt-1.5 text-xs text-govbid-text-muted">
                            {formatTime(notification.createdAt)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNotification(notification.id);
                          }}
                          className="text-govbid-text-muted transition hover:text-govbid-text"
                          aria-label="Dismiss"
                        >
                          <XIcon />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="border-t border-govbid-border p-3 text-center">
                <button
                  onClick={() => {
                    // clearNotifications();
                    setIsOpen(false);
                  }}
                  className="text-xs font-medium text-govbid-text-muted transition hover:text-govbid-text"
                >
                  View all activity
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
