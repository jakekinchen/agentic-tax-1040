import type { ReturnSession } from "../domain/session.js";
import { makeEvent, type AuditEvent } from "./events.js";

export function addEvent(session: ReturnSession, event: Omit<AuditEvent, "id" | "at">): AuditEvent {
  const created = makeEvent(event);
  session.events.push(created);
  session.updatedAt = new Date().toISOString();
  return created;
}

export function eventDelta(session: ReturnSession, afterEventId?: string): AuditEvent[] {
  if (!afterEventId) return session.events;
  const index = session.events.findIndex((event) => event.id === afterEventId);
  return index === -1 ? session.events : session.events.slice(index + 1);
}
