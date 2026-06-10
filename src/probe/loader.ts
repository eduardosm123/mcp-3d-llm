import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const injectedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "injected");

const cache = new Map<string, string>();

/** Reads an injected script (a bare function expression) from probe/injected/. */
export function injectedScript(name: string): string {
  let src = cache.get(name);
  if (!src) {
    src = readFileSync(path.join(injectedDir, name), "utf8");
    cache.set(name, src);
  }
  return src;
}

/** Builds an evaluate() expression: calls the injected function with JSON args. */
export function callInjected(name: string, args?: unknown): string {
  const src = injectedScript(name).trim().replace(/;$/, "");
  return args === undefined ? `(${src})()` : `(${src})(${JSON.stringify(args)})`;
}
