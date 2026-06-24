import { readFile } from "node:fs/promises";
import { join } from "node:path";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";
import { verifyRuntimeAssets } from "./assets/verify-assets.js";
import { answer, getUiState, uploadW2 } from "./conversation/controller.js";
import type { ReturnSession } from "./domain/session.js";
import { publicMessage, PublicError } from "./http/errors.js";
import { AnswerRequestSchema } from "./http/schemas.js";
import { getSessionCookie, setSessionCookie } from "./sessions/cookie.js";
import { SessionStore } from "./sessions/store.js";
import { event } from "./observability/events.js";

export type BuiltApp = {
  app: FastifyInstance;
  store: SessionStore;
};

function requireOrigin(request: FastifyRequest): void {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.origin;
  if (!origin) return;
  const host = request.headers.host;
  if (!host) throw new PublicError("Missing host header.", 400, "missing_host");
  const parsed = new URL(origin);
  if (parsed.host !== host) throw new PublicError("Cross-origin mutation requests are not allowed.", 403, "bad_origin");
}

function sessionFromRequest(store: SessionStore, request: FastifyRequest, reply: FastifyReply): ReturnSession {
  const existing = store.get(getSessionCookie(request));
  if (existing) return existing;
  const created = store.create();
  setSessionCookie(reply, created.id, false);
  return created;
}

export async function buildApp(config: AppConfig): Promise<BuiltApp> {
  const assetsVerified = await verifyRuntimeAssets();
  const store = new SessionStore(config);

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: [
        "req.headers.cookie",
        "req.body",
        "res.headers.set-cookie",
        "*.ssn",
        "*.ein",
        "*.address",
        "*.bytes",
        "*.fileData",
        "*.pdf"
      ]
    },
    bodyLimit: config.MAX_UPLOAD_BYTES + 1024 * 1024
  });

  app.addHook("onRequest", (request, _reply, done) => {
    try {
      requireOrigin(request);
      done();
    } catch (error) {
      done(error instanceof Error ? error : new Error("Origin check failed."));
    }
  });

  app.addHook("onSend", (_request, reply, payload, done) => {
    reply.header("Cache-Control", "no-store");
    done(null, payload);
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"]
      }
    }
  });
  await app.register(rateLimit, { max: config.NODE_ENV === "test" ? 1_000 : 20, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { files: 1, fileSize: config.MAX_UPLOAD_BYTES }
  });
  await app.register(fastifyStatic, {
    root: join(process.cwd(), "public"),
    prefix: "/"
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    const message = publicMessage(error);
    void reply.status(message.statusCode).send(message.body);
  });

  app.get("/health", () => ({
    status: "ok",
    taxYear: 2025,
    model: config.OPENAI_MODEL,
    assetsVerified
  }));

  app.post("/api/session", async (request, reply) => {
    const session = store.reset(getSessionCookie(request));
    setSessionCookie(reply, session.id, config.production);
    return getUiState(session);
  });

  app.get("/api/session", async (request, reply) => getUiState(sessionFromRequest(store, request, reply)));

  app.post("/api/w2", async (request, reply) => {
    const session = sessionFromRequest(store, request, reply);
    let syntheticAcknowledgement = false;
    let sample = false;
    let bytes: Uint8Array | undefined;
    let declaredMime: string | undefined;
    let fileCount = 0;

    for await (const part of request.parts()) {
      if (part.type === "field") {
        if (part.fieldname === "syntheticAcknowledgement") syntheticAcknowledgement = part.value === "true";
        if (part.fieldname === "sample") sample = part.value === "true";
      } else {
        fileCount += 1;
        if (fileCount > 1) throw new PublicError("Only one W-2 file may be uploaded.", 400, "too_many_files");
        declaredMime = part.mimetype;
        bytes = new Uint8Array(await part.toBuffer());
      }
    }

    const state = await uploadW2({
      session,
      config,
      ...(bytes ? { bytes } : {}),
      ...(declaredMime ? { declaredMime } : {}),
      sample,
      syntheticAcknowledgement
    });
    return state;
  });

  app.post("/api/answer", async (request, reply) => {
    const session = sessionFromRequest(store, request, reply);
    const parsed = AnswerRequestSchema.parse(request.body);
    return answer({ session, config, questionId: parsed.questionId, payload: parsed.payload });
  });

  app.get("/api/events", async (request, reply) => {
    const session = sessionFromRequest(store, request, reply);
    return { events: session.events };
  });

  app.get("/api/return.pdf", async (request, reply) => {
    const session = sessionFromRequest(store, request, reply);
    if (session.stage !== "PDF_READY" || !session.artifact) throw new PublicError("No PDF is ready for download.", 404, "pdf_not_ready");
    session.events.push(event({ category: "artifact", name: "artifact.downloaded", status: "succeeded", summary: "PDF downloaded", metadata: {} }));
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="${session.artifact.filename}"`);
    return Buffer.from(session.artifact.bytes);
  });

  app.post("/api/reset", async (request, reply) => {
    const session = store.reset(getSessionCookie(request));
    setSessionCookie(reply, session.id, config.production);
    return getUiState(session);
  });

  app.get("/", async (_request, reply) => {
    reply.type("text/html");
    return readFile(join(process.cwd(), "public/index.html"), "utf8");
  });

  setInterval(() => store.cleanup(), 5 * 60_000).unref();
  return { app, store };
}
