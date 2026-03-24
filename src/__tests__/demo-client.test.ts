import { describe, expect, it, beforeEach } from "vitest";
import { DemoClient } from "../demo.js";
import { templateId } from "../types.js";

describe("DemoClient", () => {
	let client: DemoClient;
	const ASSET_TEMPLATE = templateId("#test:Main:Asset");

	beforeEach(() => {
		client = new DemoClient();
	});

	describe("health", () => {
		it("should always be healthy", async () => {
			expect(await client.isHealthy()).toBe(true);
		});
	});

	describe("parties", () => {
		it("should have a default Alice party", async () => {
			const parties = await client.listParties();
			expect(parties).toHaveLength(1);
			expect(parties[0].displayName).toBe("Alice (Demo)");
			expect(parties[0].isLocal).toBe(true);
		});

		it("should allocate new parties", async () => {
			const { party, displayName } = await client.allocateParty("Bob");
			expect(displayName).toBe("Bob");
			expect(party).toContain("Bob");

			const parties = await client.listParties();
			expect(parties).toHaveLength(2);
		});
	});

	describe("contracts", () => {
		it("should create and query contracts", async () => {
			const result = await client.create(ASSET_TEMPLATE, {
				owner: "Alice",
				name: "Gold",
				amount: "100",
			});

			expect(result.contractId).toBeTruthy();
			expect(result.transactionId).toBeTruthy();

			const contracts = await client.query(ASSET_TEMPLATE);
			expect(contracts).toHaveLength(1);
			expect(contracts[0].payload).toEqual({
				owner: "Alice",
				name: "Gold",
				amount: "100",
			});
		});

		it("should filter contracts by query", async () => {
			await client.create(ASSET_TEMPLATE, { owner: "Alice", name: "Gold" });
			await client.create(ASSET_TEMPLATE, { owner: "Bob", name: "Silver" });

			const aliceContracts = await client.query(ASSET_TEMPLATE, {
				owner: "Alice",
			});
			expect(aliceContracts).toHaveLength(1);
			expect(aliceContracts[0].payload).toMatchObject({ name: "Gold" });
		});

		it("should archive contracts", async () => {
			const { contractId } = await client.create(ASSET_TEMPLATE, {
				owner: "Alice",
			});

			await client.archive(ASSET_TEMPLATE, contractId);

			const contracts = await client.query(ASSET_TEMPLATE);
			expect(contracts).toHaveLength(0);
		});

		it("should exercise choices", async () => {
			const { contractId } = await client.create(ASSET_TEMPLATE, {
				owner: "Alice",
			});

			const result = await client.exercise(
				ASSET_TEMPLATE,
				contractId,
				"Transfer",
				{ newOwner: "Bob" },
			);

			expect(result.transactionId).toBeTruthy();
		});

		it("should fetch individual contracts", async () => {
			const { contractId } = await client.create(ASSET_TEMPLATE, {
				owner: "Alice",
				name: "Gold",
			});

			const contract = await client.fetch(ASSET_TEMPLATE, contractId);
			expect(contract).not.toBeNull();
			expect(contract?.payload).toMatchObject({ name: "Gold" });
		});

		it("should return null for non-existent contracts", async () => {
			const contract = await client.fetch(
				ASSET_TEMPLATE,
				"nonexistent" as any,
			);
			expect(contract).toBeNull();
		});
	});

	describe("isolation", () => {
		it("should not return contracts from different templates", async () => {
			const OTHER_TEMPLATE = templateId("#test:Main:Other");
			await client.create(ASSET_TEMPLATE, { owner: "Alice" });
			await client.create(OTHER_TEMPLATE, { owner: "Bob" });

			const assets = await client.query(ASSET_TEMPLATE);
			expect(assets).toHaveLength(1);

			const others = await client.query(OTHER_TEMPLATE);
			expect(others).toHaveLength(1);
		});
	});

	describe("reset", () => {
		it("should clear all state", async () => {
			await client.create(ASSET_TEMPLATE, { owner: "Alice" });
			expect(client.getContractCount()).toBe(1);

			client.reset();
			expect(client.getContractCount()).toBe(0);
		});
	});

	describe("packages", () => {
		it("should list demo packages", async () => {
			const packages = await client.listPackages();
			expect(packages).toHaveLength(1);
		});
	});

	describe("ledger end", () => {
		it("should return an offset", async () => {
			const offset = await client.getLedgerEnd();
			expect(offset).toContain("offset-");
		});
	});
});
