let builtApp;

async function getBuiltApp() {
  if (!builtApp) {
    const [{ buildApp }, { loadConfig }] = await Promise.all([
      import("../dist/src/app.js"),
      import("../dist/src/config.js")
    ]);
    builtApp = buildApp(loadConfig());
  }
  return builtApp;
}

async function readPayload(request) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

export default async function handler(request, response) {
  const { app } = await getBuiltApp();
  const payload = await readPayload(request);
  const result = await app.inject({
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
