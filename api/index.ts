import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp, type BuiltApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let builtApp: Promise<BuiltApp> | undefined;

async function getBuiltApp(): Promise<BuiltApp> {
  builtApp ??= buildApp(loadConfig());
  return builtApp;
}

function ensureRawHeaders(request: IncomingMessage): void {
  if (Array.isArray(request.rawHeaders)) return;
  const rawHeaders: string[] = [];
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) rawHeaders.push(key, item);
    } else if (value !== undefined) {
      rawHeaders.push(key, value);
    }
  }
  Object.defineProperty(request, "rawHeaders", {
    configurable: true,
    enumerable: false,
    value: rawHeaders
  });
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  ensureRawHeaders(request);
  const { app } = await getBuiltApp();
  app.server.emit("request", request, response);
}
