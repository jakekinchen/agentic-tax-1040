import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

// Node does not load .env files automatically; keep this tiny parser local to avoid another runtime dependency.
async function loadEnvFile(): Promise<void> {
  const { readFile } = await import("node:fs/promises");
  try {
    const text = await readFile(".env.local", "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      const key = match?.[1];
      const value = match?.[2];
      if (key && value !== undefined && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // Optional local file.
  }
}

await loadEnvFile();
const config = loadConfig();
const { app } = await buildApp(config);
await app.listen({ port: config.PORT, host: "0.0.0.0" });
