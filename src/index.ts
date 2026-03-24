/**
 * canton-sdk -- Simple TypeScript SDK for Canton Network
 *
 * Zero dependencies. Works in browser and Node.js.
 * Drop-in replacement for @canton-network/dapp-sdk with 90% less complexity.
 *
 * @example
 *   // Production: connect to real Canton node
 *   import { CantonClient, templateId } from "canton-sdk";
 *   const canton = new CantonClient({ jsonApiUrl: "http://localhost:7575", token: "..." });
 *
 *   // Development: use demo mode (no Canton node needed)
 *   import { DemoClient, templateId } from "canton-sdk";
 *   const canton = new DemoClient();
 *
 *   // Auto-select based on config:
 *   import { createCantonClient } from "canton-sdk";
 *   const canton = createCantonClient({ jsonApiUrl: "...", demo: true });
 *
 *   // Both share the same API:
 *   const contracts = await canton.query(templateId("#app:Main:Asset"));
 *   const { contractId } = await canton.create(templateId("#app:Main:Asset"), { owner: "Alice" });
 *   await canton.exercise(templateId("#app:Main:Asset"), contractId, "Transfer", { newOwner: "Bob" });
 *
 *   // React hooks (import from "canton-sdk/react"):
 *   import { useCanton, useContracts } from "canton-sdk/react";
 */

// Core clients
export { CantonClient } from "./client.js";
export { DemoClient } from "./demo.js";
export { createCantonClient } from "./factory.js";

// Event system
export { CantonEventEmitter } from "./events.js";

// Types
export {
	type CantonConfig,
	CantonError,
	type CantonEventListener,
	type CantonEventMap,
	type CantonEventType,
	type CommandResult,
	type ConnectionState,
	type Contract,
	type ContractId,
	type CreateResult,
	type ExerciseResult,
	type LedgerEvent,
	type PartyId,
	type QueryFilter,
	type RetryConfig,
	type TemplateId,
	type WebSocketState,
	contractId,
	partyId,
	templateId,
} from "./types.js";
