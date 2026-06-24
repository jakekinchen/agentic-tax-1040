import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp, type BuiltApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let builtApp: Promise<BuiltApp> | undefined;

async function getBuiltApp(): Promise<BuiltApp> {
  builtApp ??= buildApp(loadConfig());
  return builtApp;
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const { app } = await getBuiltApp();
  app.server.emit("request", request, response);
}
