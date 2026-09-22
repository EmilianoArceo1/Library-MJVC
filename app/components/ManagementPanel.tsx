"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

type RegistrationRequest = {
  id: number;
  userId: string;
  name: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: number;
  updatedAt: number;
  lastDecisionBy?: string | null;
  lastDecisionAt?: number | null;
  role?: string | null;
  approvalStatus?: string | null;
};

type BookRequest = {
  id: number;
  userId: string;
  requesterName: string;
  requesterEmail: string;
  title: string;
  author: string;
  year: number;
  pages: number;
  synopsis: string;
  type: string;
  copies: number;
  originalName: string;
  status: "pending" | "approved" | "rejected";
  createdBookId?: number | null;
  requestedAt: number;
  updatedAt: number;
  lastDecisionBy?: string | null;
  lastDecisionAt?: number | null;
};

type DecisionRecord = {
  id: number;
  requestType: "registration" | "book";
  requestId: string;
  decision: "approved" | "rejected";
  actorId: string;
  actorName: string;
  message: string;
  createdAt: number;
};

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  description: string;
  role: "reader" | "advisor" | "admin";
  approvalStatus: "pending" | "approved" | "rejected";
  pagesRead: number;
};

type Tab = "pending" | "history" | "users" | "broadcast";

const statusLabel = (status: string) =>
  status === "approved" ? "Aprobada" : status === "rejected" ? "Rechazada" : "Pendiente";

const roleLabel = (role: string) =>
  role === "admin" ? "Administrador" : role === "advisor" ? "Asesor" : "Lector";

export default function ManagementPanel({
  role,
  onCatalogChanged,
}: {
  role: "admin" | "advisor";
  onCatalogChanged?: () => void;
}) {
  const isAdmin = role === "admin";
  const [tab, setTab] = useState<Tab>("pending");
  const [registrations, setRegistrations] = useState<RegistrationRequest[]>([]);
  const [bookRequests, setBookRequests] = useState<BookRequest[]>([]);
  const [history, setHistory] = useState<DecisionRecord[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/moderation", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudieron cargar las solicitudes");
      setRegistrations(Array.isArray(payload.registrations) ? payload.registrations : []);
      setBookRequests(Array.isArray(payload.bookRequests) ? payload.bookRequests : []);
      setHistory(Array.isArray(payload.history) ? payload.history : []);

      if (isAdmin) {
        const usersResponse = await fetch("/api/admin/users", { cache: "no-store" });
        const usersPayload = await usersResponse.json();
        if (!usersResponse.ok) throw new Error(usersPayload.error || "No se pudieron cargar los usuarios");
        setUsers(Array.isArray(usersPayload.users) ? usersPayload.users : []);
        setCurrentUserId(String(usersPayload.currentUserId || ""));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo cargar la gestión.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [isAdmin]);

  const pendingRegistrations = useMemo(
    () => registrations.filter((request) => request.status === "pending"),
    [registrations],
  );
  const pendingBooks = useMemo(
    () => bookRequests.filter((request) => request.status === "pending"),
    [bookRequests],
  );

  const subjectForDecision = (record: DecisionRecord) => {
    if (record.requestType === "registration") {
      const request = registrations.find((item) => String(item.id) === String(record.requestId));
      return request ? `Registro de ${request.name}` : `Registro #${record.requestId}`;
    }
    const request = bookRequests.find((item) => String(item.id) === String(record.requestId));
    return request ? `Libro “${request.title}”` : `Libro #${record.requestId}`;
  };

  const currentStatusForDecision = (record: DecisionRecord) => {
    if (record.requestType === "registration") {
      return registrations.find((item) => String(item.id) === String(record.requestId))?.status;
    }
    return bookRequests.find((item) => String(item.id) === String(record.requestId))?.status;
  };

  const decide = async (
    type: "registration" | "book",
    id: number,
    decision: "approved" | "rejected",
    subject: string,
  ) => {
    const message =
      window.prompt(
        `${decision === "approved" ? "Aprobar" : "Rechazar"} ${subject}.\n\nMensaje para el usuario (opcional):`,
        "",
      ) ?? "";
    const key = `${type}:${id}:${decision}`;
    setBusyKey(key);
    try {
      const response = await fetch("/api/moderation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, decision, message }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo guardar el dictamen");
      setNotice(`${subject}: decisión guardada por ${payload.actor}.`);
      await load();
      onCatalogChanged?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo guardar la decisión.");
    } finally {
      setBusyKey("");
    }
  };

  const saveUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingUser) return;
    const form = new FormData(event.currentTarget);
    setBusyKey(`user:${editingUser.id}`);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingUser.id,
          name: String(form.get("name") || ""),
          email: String(form.get("email") || ""),
          description: String(form.get("description") || ""),
          role: String(form.get("role") || "reader"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo actualizar el usuario");
      setEditingUser(null);
      setNotice("Usuario actualizado.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo actualizar el usuario.");
    } finally {
      setBusyKey("");
    }
  };

  const deleteUser = async (user: ManagedUser) => {
    if (!window.confirm(`¿Eliminar definitivamente a ${user.name}? Se borrarán su sesión, préstamos, publicaciones y datos personales.`)) return;
    setBusyKey(`delete:${user.id}`);
    try {
      const response = await fetch(`/api/admin/users?id=${encodeURIComponent(user.id)}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo eliminar el usuario");
      setNotice(`${user.name} fue eliminado de la base de datos.`);
      await load();
      onCatalogChanged?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo eliminar el usuario.");
    } finally {
      setBusyKey("");
    }
  };

  const broadcast = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusyKey("broadcast");
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(data.get("title") || ""),
          body: String(data.get("body") || ""),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo enviar el aviso");
      form.reset();
      setNotice("Aviso enviado a toda la comunidad.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo enviar el aviso.");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <section className="page management-page">
      <div className="management-hero">
        <div>
          <p className="eyebrow">CENTRO DE GESTIÓN</p>
          <h1>{isAdmin ? "Administrar la biblioteca" : "Mesa de asesoría"}</h1>
          <p>
            Revisa registros, propuestas de libros y el historial completo de dictámenes.
            Cada decisión conserva quién la tomó.
          </p>
        </div>
        <button className="secondary" type="button" onClick={load} disabled={loading}>
          Actualizar
        </button>
      </div>

      {notice && <div className="management-notice">{notice}</div>}

      <div className="management-tabs">
        <button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>
          Pendientes
          <span>{pendingRegistrations.length + pendingBooks.length}</span>
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          Historial
        </button>
        {isAdmin && (
          <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
            Usuarios
          </button>
        )}
        {isAdmin && (
          <button className={tab === "broadcast" ? "active" : ""} onClick={() => setTab("broadcast")}>
            Aviso general
          </button>
        )}
      </div>

      {loading ? (
        <p className="empty-note">Cargando centro de gestión…</p>
      ) : tab === "pending" ? (
        <div className="management-columns">
          <div className="management-column">
            <div className="management-column-title">
              <p className="eyebrow">NUEVOS USUARIOS</p>
              <h2>Registros por revisar</h2>
            </div>
            {pendingRegistrations.length === 0 ? (
              <p className="empty-note">No hay registros pendientes.</p>
            ) : (
              pendingRegistrations.map((request) => (
                <article className="request-card" key={`registration-${request.id}`}>
                  <div className="request-card-head">
                    <div>
                      <b>{request.name}</b>
                      <span>{request.email}</span>
                    </div>
                    <span className="request-status pending">Pendiente</span>
                  </div>
                  <small>
                    Solicitado {new Date(request.requestedAt).toLocaleString("es-MX")}
                  </small>
                  <div className="request-actions">
                    <button
                      className="primary"
                      disabled={Boolean(busyKey)}
                      onClick={() => decide("registration", request.id, "approved", `el registro de ${request.name}`)}
                    >
                      Aprobar
                    </button>
                    <button
                      className="secondary danger"
                      disabled={Boolean(busyKey)}
                      onClick={() => decide("registration", request.id, "rejected", `el registro de ${request.name}`)}
                    >
                      Rechazar
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="management-column">
            <div className="management-column-title">
              <p className="eyebrow">NUEVOS LIBROS</p>
              <h2>Propuestas por revisar</h2>
            </div>
            {pendingBooks.length === 0 ? (
              <p className="empty-note">No hay propuestas pendientes.</p>
            ) : (
              pendingBooks.map((request) => (
                <article className="request-card book-request-card" key={`book-${request.id}`}>
                  <div className="request-card-head">
                    <div>
                      <b>{request.title}</b>
                      <span>{request.author} · {request.year}</span>
                    </div>
                    <span className="request-status pending">Pendiente</span>
                  </div>
                  <p>{request.synopsis}</p>
                  <div className="request-facts">
                    <span>{request.pages} páginas</span>
                    <span>{request.copies} ejemplar{request.copies === 1 ? "" : "es"}</span>
                    <span>{request.type}</span>
                  </div>
                  <small>
                    Propuesto por {request.requesterName} · {request.originalName}
                  </small>
                  <div className="request-actions">
                    <button
                      className="primary"
                      disabled={Boolean(busyKey)}
                      onClick={() => decide("book", request.id, "approved", `“${request.title}”`)}
                    >
                      Aprobar
                    </button>
                    <button
                      className="secondary danger"
                      disabled={Boolean(busyKey)}
                      onClick={() => decide("book", request.id, "rejected", `“${request.title}”`)}
                    >
                      Rechazar
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      ) : tab === "history" ? (
        <div className="history-layout">
          <div className="history-feed">
            {history.length === 0 ? (
              <p className="empty-note">Todavía no hay dictámenes registrados.</p>
            ) : (
              history.map((record) => (
                <article className="history-card" key={record.id}>
                  <span className={`history-decision ${record.decision}`}>
                    {record.decision === "approved" ? "Aprobó" : "Rechazó"}
                  </span>
                  <div>
                    <b>{subjectForDecision(record)}</b>
                    <p>
                      <strong>{record.actorName}</strong> tomó esta decisión
                      {record.message ? `: “${record.message}”` : "."}
                    </p>
                    <small>{new Date(record.createdAt).toLocaleString("es-MX")}</small>
                  </div>
                  <div className="history-reevaluate">
                    <button
                      type="button"
                      onClick={() => {
                        const currentStatus = currentStatusForDecision(record);
                        decide(
                          record.requestType,
                          Number(record.requestId),
                          currentStatus === "approved" ? "rejected" : "approved",
                          subjectForDecision(record),
                        );
                      }}
                    >
                      Reevaluar
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      ) : tab === "users" && isAdmin ? (
        <div className="users-admin-list">
          {users.map((user) => (
            <article className="managed-user-card" key={user.id}>
              <div className="managed-user-main">
                <div>
                  <b>{user.name}</b>
                  <span>{user.email}</span>
                </div>
                <div className="managed-user-badges">
                  <span>{roleLabel(user.role)}</span>
                  <span className={`request-status ${user.approvalStatus}`}>
                    {statusLabel(user.approvalStatus)}
                  </span>
                </div>
              </div>
              <p>{user.pagesRead.toLocaleString("es-MX")} páginas leídas</p>
              <div className="request-actions">
                <button className="secondary" type="button" onClick={() => setEditingUser(user)}>
                  Editar
                </button>
                <button
                  className="secondary danger"
                  type="button"
                  disabled={user.id === currentUserId || Boolean(busyKey)}
                  onClick={() => deleteUser(user)}
                >
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : tab === "broadcast" && isAdmin ? (
        <form className="broadcast-form" onSubmit={broadcast}>
          <p className="eyebrow">AVISO A TODA LA COMUNIDAD</p>
          <h2>Enviar una notificación general</h2>
          <p>Este mensaje aparecerá en el apartado de notificaciones de todos los usuarios.</p>
          <label>
            Título
            <input name="title" required maxLength={120} placeholder="Ej. Jornada de mantenimiento" />
          </label>
          <label>
            Mensaje
            <textarea name="body" required maxLength={1200} placeholder="Escribe el aviso…" />
          </label>
          <button className="primary" disabled={busyKey === "broadcast"}>
            {busyKey === "broadcast" ? "Enviando…" : "Enviar a todos"}
          </button>
        </form>
      ) : null}

      {editingUser && isAdmin && (
        <div className="modal-back" onClick={() => setEditingUser(null)}>
          <form className="profile-modal user-admin-modal" onSubmit={saveUser} onClick={(event) => event.stopPropagation()}>
            <button className="close" type="button" onClick={() => setEditingUser(null)}>×</button>
            <p className="eyebrow">GESTIONAR USUARIO</p>
            <h2>{editingUser.name}</h2>
            <label>
              Nombre
              <input name="name" required maxLength={80} defaultValue={editingUser.name} />
            </label>
            <label>
              Correo
              <input name="email" type="email" required maxLength={254} defaultValue={editingUser.email} />
            </label>
            <label>
              Rol
              <select name="role" defaultValue={editingUser.role}>
                <option value="reader">Lector</option>
                <option value="advisor">Asesor</option>
                <option value="admin">Administrador</option>
              </select>
              <small>Los asesores pueden dictaminar registros y libros, pero no editar ni eliminar usuarios o libros.</small>
            </label>
            <label>
              Sobre mí
              <textarea name="description" maxLength={320} defaultValue={editingUser.description || ""} />
            </label>
            <div className="stats">
              <span><b>{editingUser.pagesRead.toLocaleString("es-MX")}</b> páginas leídas</span>
              <span><b>{statusLabel(editingUser.approvalStatus)}</b> estado</span>
            </div>
            <button className="primary wide" disabled={Boolean(busyKey)}>
              Guardar usuario
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
