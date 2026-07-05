/**
 * Single source of truth for the server version: package.json.
 *
 * Resolved relative to this file so it works from src/ (tsx, vitest) and from
 * dist/ (node, Docker, npm package) alike — both sit one level below the
 * package root.
 */

import { createRequire } from "node:module";

const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

export const VERSION: string = pkg.version;
