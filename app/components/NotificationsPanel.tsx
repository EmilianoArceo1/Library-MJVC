"use client";

import { useEffect, useState } from "react";

type NotificationItem = {
  id: number;
  title: string;
  body: string;
  kind: string;
  createdByName?: string | null;
  createdAt: number;
  read: boolean;
};

export default function NotificationsPanel({
  onUnreadChange,
}: {
  onUnreadChange?: (count: number) => void;
}) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudieron cargar las notificaciones");
      const notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
      setItems(notifications);
      onUnreadChange?.(Number(payload.unread) || 0);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markRead = async (id: number) => {
    setBusy(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo marcar la notificación");
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, read: true } : item)),
      );
      const unread = items.filter((item) => !item.read && item.id !== id).length;
      onUnreadChange?.(unread);
    } finally {
      setBusy(false);
    }
  };

  const markAll = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudieron marcar las notificaciones");
      setItems((current) => current.map((item) => ({ ...item, read: true })));
      onUnreadChange?.(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page notifications-page">
      <div className="notifications-hero">
        <div>
          <p className="eyebrow">NOTIFICACIONES</p>
          <h1>Lo importante llega hasta ti</h1>
          <p>Aquí aparecen avisos generales y decisiones que solo corresponden a tu cuenta.</p>
        </div>
        <div className="notification-actions">
          <button className="secondary" type="button" onClick={load} disabled={loading}>
            Actualizar
          </button>
          <button className="primary" type="button" onClick={markAll} disabled={busy || items.every((item) => item.read)}>
            Marcar todo como leído
          </button>
        </div>
      </div>

      <div className="notification-list">
        {loading ? (
          <p className="empty-note">Cargando notificaciones…</p>
        ) : items.length === 0 ? (
          <div className="empty-state-card">
            <b>No tienes notificaciones todavía.</b>
            <span>Cuando haya una decisión o un aviso para la comunidad, aparecerá aquí.</span>
          </div>
        ) : (
          items.map((item) => (
            <article key={item.id} className={`notification-card ${item.read ? "read" : "unread"}`}>
              <div className="notification-dot" aria-hidden="true" />
              <div className="notification-copy">
                <div className="notification-meta">
                  <span>{item.kind === "broadcast" ? "Aviso general" : "Mensaje para ti"}</span>
                  <time>
                    {new Date(item.createdAt).toLocaleString("es-MX", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
                {item.createdByName && <small>Emitido por {item.createdByName}</small>}
              </div>
              {!item.read && (
                <button className="notification-read-button" type="button" disabled={busy} onClick={() => markRead(item.id)}>
                  Marcar leída
                </button>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
