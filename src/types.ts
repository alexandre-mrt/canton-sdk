/**
 * Core types for Canton SDK.
 * These types provide a clean, type-safe interface to the Canton JSON Ledger API v2.
 *
 * Comparison with official @canton-network packages:
 * - @canton-network/core-types: 50+ types, internal enums, protobuf-derived
 * - canton-sdk: ~20 types, developer-friendly, JSON-API-aligned
 */

/** Canton party identifier (e.g., "Alice::1220f2fe29...") */
export type PartyId = string & { readonly __brand: "PartyId" };

/** Canton contract identifier */
export type ContractId<T = unknown> = string & {
	readonly __brand: "ContractId";
	readonly __template: T;
};

/** Template identifier (format: #package-name:Module:Template) */
export type TemplateId = string & { readonly __brand: "TemplateId" };

/**
 * Create a typed template ID from a string.
 * @param id - Template identifier string (e.g., "#my-app:Main:Asset")
 * @returns A branded TemplateId
 */
export function templateId(id: string): TemplateId {
	return id as TemplateId;
}

/**
 * Create a typed party ID from a string.
 * @param id - Party identifier string (e.g., "Alice::1220f2fe29...")
 * @returns A branded PartyId
 */
export function partyId(id: string): PartyId {
	return id as PartyId;
}

/**
 * Create a typed contract ID from a string.
 * @param id - Contract identifier string
 * @returns A branded ContractId
 */
export function contractId<T = unknown>(id: string): ContractId<T> {
	return id as ContractId<T>;
}

/** Canton SDK configuration */
export interface CantonConfig {
	/** JSON Ledger API base URL (e.g., "http://localhost:7575") */
	jsonApiUrl: string;
	/** JWT token for authentication */
	token?: string;
	/** Application identifier for command deduplication */
	applicationId?: string;
	/** Request timeout in milliseconds (default: 30000) */
	timeout?: number;
	/** Use demo mode (in-memory ledger, no real Canton node) */
	demo?: boolean;
	/** Retry configuration for failed requests */
	retry?: RetryConfig;
}

/** Retry configuration for exponential backoff */
export interface RetryConfig {
	/** Maximum number of retry attempts (default: 3) */
	maxRetries?: number;
	/** Initial delay in milliseconds before first retry (default: 1000) */
	initialDelayMs?: number;
	/** Maximum delay in milliseconds between retries (default: 10000) */
	maxDelayMs?: number;
	/** Multiplier for exponential backoff (default: 2) */
	backoffMultiplier?: number;
}

/** Active contract on the ledger */
export interface Contract<T = Record<string, unknown>> {
	contractId: ContractId<T>;
	templateId: TemplateId;
	payload: T;
	signatories: PartyId[];
	observers: PartyId[];
	createdAt?: string;
}

/** Command submission result */
export interface CommandResult {
	completionOffset: string;
	transactionId: string;
}

/** Create command result (includes contract ID) */
export interface CreateResult<T = unknown> extends CommandResult {
	contractId: ContractId<T>;
}

/** Exercise command result */
export interface ExerciseResult<R = unknown> extends CommandResult {
	exerciseResult: R;
}

/** Query filter for active contracts */
export type QueryFilter = Record<string, unknown>;

/** Event from the update stream */
export interface LedgerEvent {
	eventType: "created" | "archived";
	contractId: string;
	templateId: string;
	offset: string;
	payload?: Record<string, unknown>;
}

/** Error from the Canton JSON API */
export class CantonError extends Error {
	readonly status: number;
	readonly errorCode: string;
	readonly details: string;

	constructor(status: number, errorCode: string, details: string) {
		super(`Canton API error ${status}: ${errorCode} - ${details}`);
		this.name = "CantonError";
		this.status = status;
		this.errorCode = errorCode;
		this.details = details;
	}

	/** Whether this error is retryable (5xx or network errors) */
	get isRetryable(): boolean {
		return this.status >= 500 || this.status === 429;
	}
}

/** Connection state */
export type ConnectionState =
	| { status: "disconnected" }
	| { status: "connecting" }
	| { status: "connected"; party: PartyId; participantId: string }
	| { status: "error"; error: string };

/** Event types emitted by the CantonClient event system */
export type CantonEventType =
	| "contractCreated"
	| "contractArchived"
	| "choiceExercised"
	| "connected"
	| "disconnected"
	| "error"
	| "tokenExpiring";

/** Payload for each event type */
export interface CantonEventMap {
	contractCreated: { contractId: string; templateId: string; payload: Record<string, unknown> };
	contractArchived: { contractId: string; templateId: string };
	choiceExercised: { contractId: string; templateId: string; choice: string; result: unknown };
	connected: { party: PartyId };
	disconnected: Record<string, never>;
	error: { message: string; code?: string };
	tokenExpiring: { expiresInMs: number };
}

/** Listener function for Canton events */
export type CantonEventListener<K extends CantonEventType> = (
	event: CantonEventMap[K],
) => void;

/** WebSocket connection state */
export type WebSocketState = "closed" | "connecting" | "open" | "error";
