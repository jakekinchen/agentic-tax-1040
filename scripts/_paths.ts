import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const rootDir = resolve(here, "..");
export const irsDir = resolve(rootDir, "assets", "irs", "2025");
export const fixturesDir = resolve(rootDir, "fixtures");
