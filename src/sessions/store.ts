import { randomBytes } from "node:crypto";
import { MemorySession } from "@openai/agents";
import type { AppConfig } from "../config.js";
import type { ReturnSession } from "../domain/session.js";
import { clearSensitiveSessionState } from "../domain/session.js";
import { addEvent } from "../observability/event-store.js";

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(): string {
  return randomBytes(32).toString("base64url");
}

export class SessionStore {
  readonly #sessions = new Map<string, ReturnSession>();
  readonly #config: AppConfig;

  constructor(config: AppConfig) {
    this.#config = config;
  }

  create(): ReturnSession {
    this.evictIfNeeded();
    const now = Date.now();
    const id = randomId();
    const session: ReturnSession = {
      id,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.#config.SESSION_TTL_MINUTES * 60_000).toISOString(),
      absoluteExpiresAt: new Date(now + this.#config.SESSION_MAX_LIFETIME_MINUTES * 60_000).toISOString(),
      stage: "NEW",
      questionBudget: { max: 5, allocated: [], answered: [] },
      modelCalls: 0,
      toolCalls: 0,
      events: [],
      agentSession: new MemorySession({ sessionId: id }),
      syntheticAcknowledged: false
    };
    this.#sessions.set(id, session);
    addEvent(session, {
      category: "session",
      name: "session.created",
      status: "succeeded",
      summary: "Session created",
      metadata: { session: "active" }
    });
    return session;
  }

  get(id: string | undefined): ReturnSession | null {
    if (!id) return null;
    const session = this.#sessions.get(id);
    if (!session) return null;
    if (this.isExpired(session)) {
      this.delete(id, "expired");
      return null;
    }
    this.touch(session);
    return session;
  }

  reset(id: string | undefined): ReturnSession {
    if (id) this.delete(id, "reset");
    return this.create();
  }

  delete(id: string, reason = "reset"): void {
    const session = this.#sessions.get(id);
    if (!session) return;
    clearSensitiveSessionState(session);
    addEvent(session, {
      category: "session",
      name: reason === "expired" ? "session.expired" : "session.reset",
      status: "succeeded",
      summary: `Session ${reason}`,
      metadata: {}
    });
    this.#sessions.delete(id);
  }

  cleanup(): void {
    for (const [id, session] of this.#sessions.entries()) {
      if (this.isExpired(session)) this.delete(id, "expired");
    }
  }

  private touch(session: ReturnSession): void {
    const expiresAt = Math.min(
      Date.now() + this.#config.SESSION_TTL_MINUTES * 60_000,
      Date.parse(session.absoluteExpiresAt)
    );
    session.expiresAt = new Date(expiresAt).toISOString();
    session.updatedAt = nowIso();
    this.#sessions.delete(session.id);
    this.#sessions.set(session.id, session);
  }

  private isExpired(session: ReturnSession): boolean {
    const now = Date.now();
    return now >= Date.parse(session.expiresAt) || now >= Date.parse(session.absoluteExpiresAt);
  }

  private evictIfNeeded(): void {
    while (this.#sessions.size >= this.#config.MAX_ACTIVE_SESSIONS) {
      const first = this.#sessions.keys().next().value;
      if (!first) break;
      this.delete(first, "expired");
    }
  }
}
