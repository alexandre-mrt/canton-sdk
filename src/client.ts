/**
 * CantonClient -- the core of canton-sdk.
 *
 * A simple, type-safe client for the Canton JSON Ledger API v2.
 * Zero dependencies. Works in browser and Node.js.
 *
 * Features:
 * - Exponential backoff retry for transient failures
 * - EventEmitter for contract lifecycle events
 * - Token expiry detection and refresh callback
 * - WebSocket stub for real-time updates
 *
 * @example
 *   const canton = new CantonClient({ jsonApiUrl: "http://localhost:7575", token: "..." });
 *   canton.on("contractCreated", (e) => console.log("Created:", e.contractId));
 *   const contracts = await canton.query(templateId("#my-app:Main:Asset"));
 *   const cid = await canton.create(templateId("#my-app:Main:Asset"), { owner: "Alice", amount: "100" });
 *   await canton.exercise(templateId("#my-app:Main:Asset"), cid, "Transfer", { newOwner: "Bob" });
 */

import { CantonEventEmitter } from "./events.js";
import {
	type CantonConfig,
	CantonError,
	type CantonEventListener,
	type CantonEventType,
	type CommandResult,
	type Contract,
	type ContractId,
	type CreateResult,
	type ExerciseResult,
	type PartyId,
	type QueryFilter,
	type RetryConfig,
	type TemplateId,
	type WebSocketState,
	partyId,
} from "./types.js";

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_APP_ID = "canton-sdk";

const DEFAULT_RETRY: Required<RetryConfig> = {
	maxRetries: 3,
	initialDelayMs: 1_000,
	maxDelayMs: 10_000,
	backoffMultiplier: 2,
};

/** HTTP status codes that are safe to retry */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * CantonClient provides a type-safe interface to the Canton JSON Ledger API v2.
 *
 * Supports automatic retry with exponential backoff, an event system for
 * contract lifecycle changes, and optional token refresh handling.
 */
export class CantonClient {
	private readonly config: Required<
		Pick<CantonConfig, "jsonApiUrl" | "applicationId" | "timeout">
	> &
		CantonConfig;
	private readonly retry: Required<RetryConfig>;
	private readonly emitter = new CantonEventEmitter();
	private token: string | undefined;
	private tokenRefreshCallback: (() => Promise<string>) | null = null;
	private wsState: WebSocketState = "closed";

	/**
	 * Create a new CantonClient instance.
	 * @param config - Client configuration including API URL, token, and retry settings
	 */
	/** Shared promise to deduplicate concurrent token refresh calls */
	private tokenRefreshPromise: Promise<string> | null = null;

	constructor(config: CantonConfig) {
		const url = new URL(config.jsonApiUrl);
		if (!["http:", "https:"].includes(url.protocol)) {
			throw new Error(`Unsupported protocol: ${url.protocol}`);
		}

		this.config = {
			applicationId: DEFAULT_APP_ID,
			timeout: DEFAULT_TIMEOUT,
			...config,
		};
		this.token = config.token;
		this.retry = { ...DEFAULT_RETRY, ...config.retry };
	}

	// -- Event System -----------------------------------------------

	/**
	 * Register an event listener for contract lifecycle and connection events.
	 * @param event - Event type to listen for
	 * @param listener - Callback invoked when the event fires
	 * @returns Cleanup function that removes the listener
	 *
	 * @example
	 *   const cleanup = canton.on("contractCreated", (e) => console.log(e.contractId));
	 *   // Later: cleanup();
	 */
	on<K extends CantonEventType>(
		event: K,
		listener: CantonEventListener<K>,
	): () => void {
		return this.emitter.on(event, listener);
	}

	/**
	 * Register a one-time event listener.
	 * @param event - Event type to listen for
	 * @param listener - Callback invoked once when the event fires
	 * @returns Cleanup function that removes the listener
	 */
	once<K extends CantonEventType>(
		event: K,
		listener: CantonEventListener<K>,
	): () => void {
		return this.emitter.once(event, listener);
	}

	/**
	 * Remove an event listener.
	 * @param event - Event type to stop listening for
	 * @param listener - The callback to remove
	 */
	off<K extends CantonEventType>(
		event: K,
		listener: CantonEventListener<K>,
	): void {
		this.emitter.off(event, listener);
	}

	// -- Token Management -------------------------------------------

	/**
	 * Set a callback for automatic token refresh when the current token expires or is rejected.
	 * The callback should return a fresh JWT token string.
	 * @param callback - Async function that returns a new token
	 *
	 * @example
	 *   canton.setTokenRefreshCallback(async () => {
	 *     const response = await fetch("/api/refresh-token");
	 *     const { token } = await response.json();
	 *     return token;
	 *   });
	 */
	setTokenRefreshCallback(callback: () => Promise<string>): void {
		this.tokenRefreshCallback = callback;
	}

	/**
	 * Manually update the authentication token.
	 * @param newToken - The new JWT token to use for subsequent requests
	 */
	setToken(newToken: string): void {
		this.token = newToken;
	}

	// -- Core API ---------------------------------------------------

	/**
	 * Query active contracts by template.
	 * @param template - The template ID to query
	 * @param filter - Optional key-value filter applied to contract payloads
	 * @returns Array of matching active contracts
	 *
	 * @example
	 *   const assets = await canton.query<Asset>(templateId("#my-app:Main:Asset"));
	 *   const filtered = await canton.query<Asset>(templateId("#my-app:Main:Asset"), { owner: "Alice" });
	 */
	async query<T = Record<string, unknown>>(
		template: TemplateId,
		filter?: QueryFilter,
	): Promise<Contract<T>[]> {
		const result = await this.post<{
			result: {
				contractId: string;
				templateId: string;
				payload: T;
				signatories: string[];
				observers: string[];
			}[];
		}>("/v2/query", {
			templateId: template,
			query: filter ?? {},
		});

		return (result.result ?? []).map((r) => ({
			contractId: r.contractId as ContractId<T>,
			templateId: r.templateId as TemplateId,
			payload: r.payload,
			signatories: r.signatories as PartyId[],
			observers: r.observers as PartyId[],
		}));
	}

	/**
	 * Create a new contract on the ledger.
	 * Emits a "contractCreated" event on success.
	 * @param template - The template ID for the new contract
	 * @param payload - The contract payload data
	 * @returns Creation result including the new contract ID and transaction details
	 *
	 * @example
	 *   const result = await canton.create(templateId("#my-app:Main:Asset"), {
	 *     issuer: "Alice", owner: "Alice", name: "Gold", amount: "100.0"
	 *   });
	 *   console.log(result.contractId);
	 */
	async create<T = Record<string, unknown>>(
		template: TemplateId,
		payload: Record<string, unknown>,
	): Promise<CreateResult<T>> {
		const result = await this.post<{
			result: { completionOffset: string; transactionId: string };
			events: { created: { contractId: string }[] };
		}>("/v2/commands/submit-and-wait-for-transaction", {
			commands: [{ templateId: template, payload }],
			applicationId: this.config.applicationId,
		});

		const createdEvent = result.events?.created?.[0];
		const contractIdValue = (createdEvent?.contractId ?? "") as ContractId<T>;

		this.emitter.emit("contractCreated", {
			contractId: contractIdValue as string,
			templateId: template as string,
			payload,
		});

		return {
			contractId: contractIdValue,
			completionOffset: result.result?.completionOffset ?? "",
			transactionId: result.result?.transactionId ?? "",
		};
	}

	/**
	 * Exercise a choice on an existing contract.
	 * Emits a "choiceExercised" event on success.
	 * @param template - The template ID of the contract
	 * @param cid - The contract ID to exercise on
	 * @param choice - The choice name to exercise
	 * @param argument - Arguments for the choice (default: empty object)
	 * @returns Exercise result including the choice return value and transaction details
	 *
	 * @example
	 *   await canton.exercise(templateId("#my-app:Main:Asset"), contractId, "Transfer", { newOwner: "Bob" });
	 */
	async exercise<R = unknown>(
		template: TemplateId,
		cid: ContractId,
		choice: string,
		argument: Record<string, unknown> = {},
	): Promise<ExerciseResult<R>> {
		const result = await this.post<{
			result: {
				completionOffset: string;
				transactionId: string;
				exerciseResult: R;
			};
		}>("/v2/commands/submit-and-wait-for-transaction", {
			commands: [{ templateId: template, contractId: cid, choice, argument }],
			applicationId: this.config.applicationId,
		});

		const exerciseResult = result.result?.exerciseResult as R;

		if (choice === "Archive") {
			this.emitter.emit("contractArchived", {
				contractId: cid as string,
				templateId: template as string,
			});
		} else {
			this.emitter.emit("choiceExercised", {
				contractId: cid as string,
				templateId: template as string,
				choice,
				result: exerciseResult,
			});
		}

		return {
			exerciseResult,
			completionOffset: result.result?.completionOffset ?? "",
			transactionId: result.result?.transactionId ?? "",
		};
	}

	/**
	 * Archive (delete) a contract. Shorthand for exercising the "Archive" choice.
	 * Emits a "contractArchived" event on success.
	 * @param template - The template ID of the contract
	 * @param cid - The contract ID to archive
	 * @returns Command result with completion offset and transaction ID
	 *
	 * @example
	 *   await canton.archive(templateId("#my-app:Main:Asset"), contractId);
	 */
	async archive(
		template: TemplateId,
		cid: ContractId,
	): Promise<CommandResult> {
		return this.exercise(template, cid, "Archive");
	}

	/**
	 * Fetch a single contract by ID. Returns null if not found.
	 * @param template - The template ID of the contract
	 * @param cid - The contract ID to fetch
	 * @returns The contract if found, or null
	 */
	async fetch<T = Record<string, unknown>>(
		template: TemplateId,
		cid: ContractId<T>,
	): Promise<Contract<T> | null> {
		const contracts = await this.query<T>(template);
		return contracts.find((c) => c.contractId === cid) ?? null;
	}

	// -- Party Management -------------------------------------------

	/**
	 * List all known parties on this participant.
	 * @returns Array of parties with their display names and locality
	 */
	async listParties(): Promise<
		{ party: PartyId; displayName: string; isLocal: boolean }[]
	> {
		const result = await this.get<{
			result: { party: string; displayName: string; isLocal: boolean }[];
		}>("/v2/parties");

		return (result.result ?? []).map((p) => ({
			party: partyId(p.party),
			displayName: p.displayName,
			isLocal: p.isLocal,
		}));
	}

	/**
	 * Allocate a new party on this participant.
	 * @param displayName - Human-readable name for the party
	 * @param identifierHint - Optional hint for the party identifier
	 * @returns The allocated party with its ID and display name
	 */
	async allocateParty(
		displayName: string,
		identifierHint?: string,
	): Promise<{ party: PartyId; displayName: string }> {
		const result = await this.post<{
			result: { party: string; displayName: string };
		}>("/v2/parties", {
			displayName,
			identifierHint: identifierHint ?? displayName,
		});

		return {
			party: partyId(result.result.party),
			displayName: result.result.displayName,
		};
	}

	// -- Package Management -----------------------------------------

	/**
	 * List all packages on this participant.
	 * @returns Array of package IDs
	 */
	async listPackages(): Promise<string[]> {
		const result = await this.get<{ result: string[] }>("/v2/packages");
		return result.result ?? [];
	}

	// -- Ledger State -----------------------------------------------

	/**
	 * Get the current ledger end offset.
	 * @returns The current ledger end offset string
	 */
	async getLedgerEnd(): Promise<string> {
		const result = await this.get<{ offset: string }>(
			"/v2/state/ledger-end",
		);
		return result.offset;
	}

	/**
	 * Health check -- is the JSON API alive?
	 * @returns true if the API is healthy, false otherwise
	 */
	async isHealthy(): Promise<boolean> {
		try {
			const response = await fetch(`${this.config.jsonApiUrl}/livez`, {
				signal: AbortSignal.timeout(5000),
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	// -- WebSocket (stub for v2/updates) ----------------------------

	/**
	 * Get the current WebSocket connection state.
	 * @returns The WebSocket state: "closed", "connecting", "open", or "error"
	 */
	getWebSocketState(): WebSocketState {
		return this.wsState;
	}

	/**
	 * Subscribe to real-time ledger updates via WebSocket.
	 * This is a stub for the Canton v2/updates endpoint.
	 * In production, this would connect to `ws://<host>/v2/updates` and emit
	 * "contractCreated" and "contractArchived" events as they arrive.
	 *
	 * @param _options - Subscription options (template filters, offset)
	 * @returns Cleanup function to close the WebSocket connection
	 */
	subscribeToUpdates(
		_options: { templates?: TemplateId[]; offset?: string } = {},
	): () => void {
		// Stub: WebSocket connection to /v2/updates would go here.
		// When implemented, this will:
		// 1. Open a WebSocket to `${this.config.jsonApiUrl.replace("http", "ws")}/v2/updates`
		// 2. Send subscription message with template filters
		// 3. Parse incoming events and emit them via the event system
		// 4. Handle reconnection with exponential backoff
		this.wsState = "closed";
		return () => {
			this.wsState = "closed";
		};
	}

	// -- Internal ---------------------------------------------------

	private async post<T>(endpoint: string, body: unknown): Promise<T> {
		return this.requestWithRetry<T>(endpoint, {
			method: "POST",
			body: JSON.stringify(body),
		});
	}

	private async get<T>(endpoint: string): Promise<T> {
		return this.requestWithRetry<T>(endpoint, { method: "GET" });
	}

	/**
	 * Execute an HTTP request with exponential backoff retry logic.
	 * Retries on 429 (rate limit) and 5xx (server errors).
	 * Attempts token refresh on 401 (unauthorized) if a refresh callback is set.
	 */
	private async requestWithRetry<T>(
		endpoint: string,
		init: RequestInit,
	): Promise<T> {
		let lastError: Error | null = null;
		let delay = this.retry.initialDelayMs;

		for (let attempt = 0; attempt <= this.retry.maxRetries; attempt++) {
			try {
				return await this.request<T>(endpoint, init);
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));

				if (err instanceof CantonError && err.status === 401 && this.tokenRefreshCallback) {
					try {
						this.token = await this.refreshTokenDeduped();
						this.emitter.emit("tokenExpiring", { expiresInMs: 0 });
						return await this.request<T>(endpoint, init);
					} catch {
						this.emitter.emit("error", {
							message: "Token refresh failed",
							code: "TOKEN_REFRESH_FAILED",
						});
						throw lastError;
					}
				}

				const isRetryable =
					(err instanceof CantonError && RETRYABLE_STATUS_CODES.has(err.status)) ||
					(err instanceof TypeError); // Network errors

				if (!isRetryable || attempt === this.retry.maxRetries) {
					break;
				}

				const jitter = Math.random() * delay * 0.5;
				await this.sleep(delay + jitter);
				delay = Math.min(delay * this.retry.backoffMultiplier, this.retry.maxDelayMs);
			}
		}

		this.emitter.emit("error", {
			message: lastError?.message ?? "Request failed after retries",
			code: "RETRY_EXHAUSTED",
		});

		throw lastError;
	}

	private async request<T>(
		endpoint: string,
		init: RequestInit,
	): Promise<T> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		if (this.token) {
			headers.Authorization = `Bearer ${this.token}`;
		}

		const response = await fetch(`${this.config.jsonApiUrl}${endpoint}`, {
			...init,
			headers: { ...headers, ...init.headers },
			signal: AbortSignal.timeout(this.config.timeout),
		});

		if (!response.ok) {
			const text = await response.text();
			let errorCode = "UNKNOWN";
			let details = text;

			try {
				const parsed = JSON.parse(text);
				errorCode = parsed.error?.errorCode ?? parsed.code ?? "UNKNOWN";
				details = parsed.error?.message ?? parsed.message ?? text;
			} catch {
				// text is not JSON
			}

			const MAX_DETAILS_LENGTH = 500;
			const truncatedDetails =
				details.length > MAX_DETAILS_LENGTH
					? `${details.slice(0, MAX_DETAILS_LENGTH)}...`
					: details;

			throw new CantonError(response.status, errorCode, truncatedDetails);
		}

		return response.json();
	}

	/**
	 * Deduplicate concurrent token refresh calls by sharing a single promise.
	 * Prevents thundering herd when multiple requests hit 401 simultaneously.
	 */
	private async refreshTokenDeduped(): Promise<string> {
		if (this.tokenRefreshPromise) {
			return this.tokenRefreshPromise;
		}

		this.tokenRefreshPromise = this.tokenRefreshCallback!().finally(() => {
			this.tokenRefreshPromise = null;
		});

		return this.tokenRefreshPromise;
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
