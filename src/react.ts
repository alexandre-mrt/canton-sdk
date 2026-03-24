/**
 * React hooks for Canton SDK.
 *
 * Import from "canton-sdk/react":
 *   import { useCanton, useContracts } from "canton-sdk/react";
 *
 * These hooks wrap CantonClient/DemoClient with React state management,
 * providing a declarative API for Canton ledger operations.
 */

export { useCanton } from "./hooks/use-canton.js";
export { useContracts } from "./hooks/use-contracts.js";
