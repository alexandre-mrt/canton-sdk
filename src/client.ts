/**
 * CantonClient — the core of canton-sdk.
 *
 * A simple, type-safe client for the Canton JSON Ledger API v2.
 * Zero dependencies. Works in browser and Node.js.
 *
 * Usage:
 *   const canton = new CantonClient({ jsonApiUrl: "http://localhost:7575", token: "..." });
 *   const contracts = await canton.query(templateId("#my-app:Main:Asset"));
 *   const cid = await canton.create(templateId("#my-app:Main:Asset"), { owner: "Alice", amount: "100" });
 *   await canton.exercise(templateId("#my-app:Main:Asset"), cid, "Transfer", { newOwner: "Bob" });
 */

import {
	type CantonConfig,
	CantonError,
	type CommandResult,
	type Contract,
	type ContractId,
	type CreateResult,
	type ExerciseResult,
	type PartyId,
	type QueryFilter,
	type TemplateId,
	partyId,
} from "./types.js";

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_APP_ID = "canton-sdk";

export class CantonClient {
	private config: Required<
		Pick<CantonConfig, "jsonApiUrl" | "applicationId" | "timeout">
	> &
		CantonConfig;

	constructor(config: CantonConfig) {
		this.config = {
			applicationId: DEFAULT_APP_ID,
			timeout: DEFAULT_TIMEOUT,
			...config,
		};
	}

	// ── Core API ────────────────────────────────────────────

	/**
	 * Query active contracts by template.
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
	 * Create a new contract.
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
		return {
			contractId: (createdEvent?.contractId ?? "") as ContractId<T>,
			completionOffset: result.result?.completionOffset ?? "",
			transactionId: result.result?.transactionId ?? "",
		};
	}

	/**
	 * Exercise a choice on a contract.
	 *
	 * @example
	 *   await canton.exercise(templateId("#my-app:Main:Asset"), contractId, "Transfer", { newOwner: "Bob" });
	 */
	async exercise<R = unknown>(
		template: TemplateId,
		contractId: ContractId,
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
			commands: [{ templateId: template, contractId, choice, argument }],
			applicationId: this.config.applicationId,
		});

		return {
			exerciseResult: result.result?.exerciseResult as R,
			completionOffset: result.result?.completionOffset ?? "",
			transactionId: result.result?.transactionId ?? "",
		};
	}

	/**
	 * Archive (delete) a contract.
	 *
	 * @example
	 *   await canton.archive(templateId("#my-app:Main:Asset"), contractId);
	 */
	async archive(
		template: TemplateId,
		contractId: ContractId,
	): Promise<CommandResult> {
		return this.exercise(template, contractId, "Archive");
	}

	/**
	 * Fetch a single contract by ID.
	 */
	async fetch<T = Record<string, unknown>>(
		template: TemplateId,
		contractId: ContractId<T>,
	): Promise<Contract<T> | null> {
		const contracts = await this.query<T>(template);
		return (
			contracts.find((c) => c.contractId === contractId) ?? null
		);
	}

	// ── Party Management ────────────────────────────────────

	/**
	 * List all known parties on this participant.
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

	// ── Package Management ──────────────────────────────────

	/**
	 * List all packages on this participant.
	 */
	async listPackages(): Promise<string[]> {
		const result = await this.get<{ result: string[] }>("/v2/packages");
		return result.result ?? [];
	}

	// ── Ledger State ────────────────────────────────────────

	/**
	 * Get the current ledger end offset.
	 */
	async getLedgerEnd(): Promise<string> {
		const result = await this.get<{ offset: string }>(
			"/v2/state/ledger-end",
		);
		return result.offset;
	}

	/**
	 * Health check — is the JSON API alive?
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

	// ── Internal ────────────────────────────────────────────

	private async post<T>(endpoint: string, body: unknown): Promise<T> {
		return this.request<T>(endpoint, {
			method: "POST",
			body: JSON.stringify(body),
		});
	}

	private async get<T>(endpoint: string): Promise<T> {
		return this.request<T>(endpoint, { method: "GET" });
	}

	private async request<T>(
		endpoint: string,
		init: RequestInit,
	): Promise<T> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		if (this.config.token) {
			headers.Authorization = `Bearer ${this.config.token}`;
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

			throw new CantonError(response.status, errorCode, details);
		}

		return response.json();
	}
}
