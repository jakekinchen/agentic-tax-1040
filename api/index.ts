import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { buildApp, type BuiltApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let builtApp: Promise<BuiltApp> | undefined;

async function getBuiltApp(): Promise<BuiltApp> {
  builtApp ??= buildApp(loadConfig());
  return builtApp;
}

async function readPayload(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

type InjectResult = {
  statusCode: number;
  headers: Record<string, string | string[] | number | undefined>;
  rawPayload?: Buffer;
  payload: string;
};

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const { app } = await getBuiltApp();
  const payload = await readPayload(request);
  const inject = app.inject as unknown as (options: {
    method: string;
    url: string;
    headers: IncomingHttpHeaders;
    payload?: Buffer;
  }) => Promise<InjectResult>;
  const result = await inject({
    method: request.method ?? "GET",
    url: request.url ?? "/",
    headers: request.headers,
    ...(payload ? { payload } : {})
  });

  response.statusCode = result.statusCode;
  for (const [key, value] of Object.entries(result.headers)) {
    if (value !== undefined) response.setHeader(key, value);
  }
  response.end(result.rawPayload ?? result.payload);
}
