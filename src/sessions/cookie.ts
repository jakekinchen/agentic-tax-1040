import type { FastifyReply, FastifyRequest } from "fastify";

export const COOKIE_NAME = "__tax1040_session";

export function getSessionCookie(request: FastifyRequest): string | undefined {
  return request.cookies[COOKIE_NAME];
}

export function setSessionCookie(reply: FastifyReply, sessionId: string, production: boolean): void {
  void reply.setCookie(COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60
  });
}
