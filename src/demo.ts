/**
 * DemoClient — in-memory Canton ledger for development.
 *
 * Drop-in replacement for CantonClient that requires no Canton node.
 * Simulates contract creation, queries, exercises, and party management.
 *
 * Usage:
 *   const canton = new DemoClient();
 *   // Same API as CantonClient — swap when ready for production
 */

import type {
	CommandResult,
	Contract,
	ContractId,
	CreateResult,
	ExerciseResult,
	PartyId,
	QueryFilter,
	TemplateId,
} from "./types.js";
import { partyId } from "./types.js";

export class DemoClient {
	private contracts = new Map<string, Contract>();
	private parties = new Map<string, { party: PartyId; displayName: string }>();
	private nextId = 1;
	private nextOffset = 1;

	constructor() {
		// Pre-allocate a default party
		const defaultParty = partyId("Alice::demo0000000000");
		this.parties.set("Alice", {
			party: defaultParty,
			displayName: "Alice (Demo)",
		});
	}

	async query<T = Record<string, unknown>>(
		template: TemplateId,
		filter?: QueryFilter,
	): Promise<Contract<T>[]> {
		const results: Contract<T>[] = [];

		for (const contract of this.contracts.values()) {
			if (contract.templateId !== template) continue;

			if (filter) {
				const matches = Object.entries(filter).every(
					([key, value]) =>
						(contract.payload as Record<string, unknown>)[key] === value,
				);
				if (!matches) continue;
			}

			results.push(contract as Contract<T>);
		}

		return results;
	}

	async create<T = Record<string, unknown>>(
		template: TemplateId,
		payload: Record<string, unknown>,
	): Promise<CreateResult<T>> {
		const id = `demo-${this.nextId++}`;
		const offset = `offset-${this.nextOffset++}`;

		const contract: Contract<Record<string, unknown>> = {
			contractId: id as ContractId<Record<string, unknown>>,
			templateId: template,
			payload,
			signatories: [this.getDefaultParty()],
			observers: [],
			createdAt: new Date().toISOString(),
		};

		this.contracts.set(id, contract);

		return {
			contractId: id as ContractId<T>,
			completionOffset: offset,
			transactionId: `tx-${id}`,
		};
	}

	async exercise<R = unknown>(
		_template: TemplateId,
		contractId: ContractId,
		choice: string,
		_argument: Record<string, unknown> = {},
	): Promise<ExerciseResult<R>> {
		const id = contractId as string;

		if (choice === "Archive") {
			this.contracts.delete(id);
		}

		return {
			exerciseResult: null as R,
			completionOffset: `offset-${this.nextOffset++}`,
			transactionId: `tx-exercise-${this.nextId++}`,
		};
	}

	async archive(
		template: TemplateId,
		contractId: ContractId,
	): Promise<CommandResult> {
		return this.exercise(template, contractId, "Archive");
	}

	async fetch<T = Record<string, unknown>>(
		_template: TemplateId,
		contractId: ContractId<T>,
	): Promise<Contract<T> | null> {
		const contract = this.contracts.get(contractId as string);
		return (contract as Contract<T>) ?? null;
	}

	async listParties(): Promise<
		{ party: PartyId; displayName: string; isLocal: boolean }[]
	> {
		return [...this.parties.values()].map((p) => ({
			...p,
			isLocal: true,
		}));
	}

	async allocateParty(
		displayName: string,
		identifierHint?: string,
	): Promise<{ party: PartyId; displayName: string }> {
		const hint = identifierHint ?? displayName;
		const party = partyId(`${hint}::demo${String(this.nextId++).padStart(10, "0")}`);
		const entry = { party, displayName };
		this.parties.set(hint, entry);
		return entry;
	}

	async listPackages(): Promise<string[]> {
		return ["demo-package-001"];
	}

	async getLedgerEnd(): Promise<string> {
		return `offset-${this.nextOffset}`;
	}

	async isHealthy(): Promise<boolean> {
		return true;
	}

	// ── Demo-specific utilities ──────────────────────────────

	/** Get the default demo party */
	getDefaultParty(): PartyId {
		return this.parties.get("Alice")?.party ?? partyId("Alice::demo0000000000");
	}

	/** Get total number of active contracts */
	getContractCount(): number {
		return this.contracts.size;
	}

	/** Clear all state (useful for testing) */
	reset(): void {
		this.contracts.clear();
		this.nextId = 1;
		this.nextOffset = 1;
	}
}
