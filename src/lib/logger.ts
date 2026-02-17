/**
 * Minimal structured logger.
 * Drop-in replacement for console.error / console.warn / console.log.
 * Adds a UTC timestamp to every log line. Swap for pino/winston at any point
 * without touching call sites.
 */

function ts() {
  return new Date().toISOString();
}

export const logger = {
  info: (...args: unknown[]) => console.log(`[${ts()}] INFO`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${ts()}] WARN`, ...args),
  error: (...args: unknown[]) => console.error(`[${ts()}] ERROR`, ...args),
};
