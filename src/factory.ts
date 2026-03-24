/**
 * Factory function for creating Canton clients.
 *
 * Automatically selects DemoClient or CantonClient based on the `demo` config flag.
 * This is the recommended way to create a client in applications that support
 * both development (demo) and production (real node) modes.
 *
 * @example
 *   // Development: uses DemoClient (no Canton node needed)
 *   const client = createCantonClient({ jsonApiUrl: "", demo: true });
 *
 *   // Production: uses CantonClient with real API
 *   const client = createCantonClient({ jsonApiUrl: "http://localhost:7575", token: "..." });
 */

import { CantonClient } from "./client.js";
import { DemoClient } from "./demo.js";
import type { CantonConfig } from "./types.js";

/**
 * Create a Canton client based on configuration.
 * Returns a DemoClient when `config.demo` is true, otherwise a CantonClient.
 *
 * Both clients share the same API surface (query, create, exercise, archive, etc.),
 * making it easy to switch between development and production without code changes.
 *
 * @param config - Client configuration. Set `demo: true` for in-memory mode.
 * @returns A CantonClient or DemoClient instance
 *
 * @example
 *   const client = createCantonClient({
 *     jsonApiUrl: process.env.CANTON_API_URL ?? "",
 *     token: process.env.CANTON_TOKEN,
 *     demo: process.env.NODE_ENV === "development",
 *   });
 */
export function createCantonClient(
	config: CantonConfig,
): CantonClient | DemoClient {
	if (config.demo) {
		return new DemoClient();
	}
	return new CantonClient(config);
}
