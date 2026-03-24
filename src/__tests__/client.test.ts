import { describe, expect, it, beforeEach, vi } from "vitest";
import { CantonClient } from "../client.js";
import { CantonError, templateId, contractId } from "../types.js";
import type { ContractId, TemplateId } from "../types.js";

const BASE_URL = "http://localhost:7575";
const TEMPLATE = templateId("#test:Main:Asset");
const CID = contractId("contract-123");

function mockFetchResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
		text: () => Promise.resolve(JSON.stringify(body)),
	} as Response;
}

describe("CantonClient", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	// ---------------------------------------------------------------
	// 1. Constructor validates URL
	// ---------------------------------------------------------------
	describe("constructor", () => {
		it("accepts http:// URL", () => {
			expect(() => new CantonClient({ jsonApiUrl: "http://localhost:7575" })).not.toThrow();
		});

		it("accepts https:// URL", () => {
			expect(() => new CantonClient({ jsonApiUrl: "https://canton.example.com" })).not.toThrow();
		});

		it("throws on invalid URL", () => {
			expect(() => new CantonClient({ jsonApiUrl: "not-a-url" })).toThrow();
		});

		it("throws on ftp:// protocol", () => {
			expect(() => new CantonClient({ jsonApiUrl: "ftp://localhost:7575" })).toThrow(
				"Unsupported protocol",
			);
		});
	});

	// ---------------------------------------------------------------
	// 2. query() calls correct endpoint with correct body
	// ---------------------------------------------------------------
	describe("query()", () => {
		it("calls /v2/query with templateId and filter", async () => {
			const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
				mockFetchResponse({ result: [] }),
			);

			const client = new CantonClient({ jsonApiUrl: BASE_URL });
			await client.query(TEMPLATE, { owner: "Alice" });

			expect(fetchSpy).toHaveBeenCalledOnce();
			const [url, init] = fetchSpy.mock.calls[0];
			expect(url).toBe(`${BASE_URL}/v2/query`);
			expect(init?.method).toBe("POST");
			const body = JSON.parse(init?.body as string);
			expect(body).toEqual({ templateId: TEMPLATE, query: { owner: "Alice" } });
		});
	});

	// ---------------------------------------------------------------
	// 3. create() calls correct endpoint
	// ---------------------------------------------------------------
	describe("create()", () => {
		it("calls /v2/commands/submit-and-wait-for-transaction", async () => {
			const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
				mockFetchResponse({
					result: { completionOffset: "o1", transactionId: "tx1" },
					events: { created: [{ contractId: "cid-1" }] },
				}),
			);

			const client = new CantonClient({ jsonApiUrl: BASE_URL });
			const result = await client.create(TEMPLATE, { owner: "Alice" });

			expect(fetchSpy).toHaveBeenCalledOnce();
			const [url, init] = fetchSpy.mock.calls[0];
			expect(url).toBe(`${BASE_URL}/v2/commands/submit-and-wait-for-transaction`);
			expect(init?.method).toBe("POST");
			expect(result.contractId).toBe("cid-1");
			expect(result.transactionId).toBe("tx1");
		});
	});

	// ---------------------------------------------------------------
	// 4. exercise() calls correct endpoint
	// ---------------------------------------------------------------
	describe("exercise()", () => {
		it("calls /v2/commands/submit-and-wait-for-transaction with choice", async () => {
			const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
				mockFetchResponse({
					result: { completionOffset: "o2", transactionId: "tx2", exerciseResult: {} },
				}),
			);

			const client = new CantonClient({ jsonApiUrl: BASE_URL });
			const result = await client.exercise(TEMPLATE, CID, "Transfer", { newOwner: "Bob" });

			expect(fetchSpy).toHaveBeenCalledOnce();
			const [url, init] = fetchSpy.mock.calls[0];
			expect(url).toBe(`${BASE_URL}/v2/commands/submit-and-wait-for-transaction`);
			const body = JSON.parse(init?.body as string);
			expect(body.commands[0]).toMatchObject({
				templateId: TEMPLATE,
				contractId: CID,
				choice: "Transfer",
				argument: { newOwner: "Bob" },
			});
			expect(result.transactionId).toBe("tx2");
		});
	});

	// ---------------------------------------------------------------
	// 5. archive() delegates to exercise with "Archive"
	// ---------------------------------------------------------------
	describe("archive()", () => {
		it("delegates to exercise with Archive choice", async () => {
			const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
				mockFetchResponse({
					result: { completionOffset: "o3", transactionId: "tx3", exerciseResult: {} },
				}),
			);

			const client = new CantonClient({ jsonApiUrl: BASE_URL });
			await client.archive(TEMPLATE, CID);

			const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
			expect(body.commands[0].choice).toBe("Archive");
		});
	});

	// ---------------------------------------------------------------
	// 6. isHealthy() returns true on 200, false on network error
	// ---------------------------------------------------------------
	describe("isHealthy()", () => {
		it("returns true on 200 OK", async () => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue(
				mockFetchResponse({}, 200),
			);

			const client = new CantonClient({ jsonApiUrl: BASE_URL });
			expect(await client.isHealthy()).toBe(true);
		});

		it("returns false on network error", async () => {
			vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

			const client = new CantonClient({ jsonApiUrl: BASE_URL });
			expect(await client.isHealthy()).toBe(false);
		});

		it("calls /livez endpoint", async () => {
			const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
				mockFetchResponse({}, 200),
			);

			const client = new CantonClient({ jsonApiUrl: BASE_URL });
			await client.isHealthy();

			expect(fetchSpy.mock.calls[0][0]).toBe(`${BASE_URL}/livez`);
		});
	});

	// ---------------------------------------------------------------
	// 7. Error handling: non-200 throws CantonError with correct status
	// ---------------------------------------------------------------
	describe("error handling", () => {
		it("throws CantonError with correct status on non-200 response", async () => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue({
				ok: false,
				status: 404,
				text: () => Promise.resolve(JSON.stringify({ error: { errorCode: "NOT_FOUND", message: "Contract not found" } })),
			} as Response);

			const client = new CantonClient({
				jsonApiUrl: BASE_URL,
				retry: { maxRetries: 0 },
			});

			await expect(client.query(TEMPLATE)).rejects.toThrow(CantonError);
			await vi.spyOn(globalThis, "fetch").mockResolvedValue({
				ok: false,
				status: 404,
				text: () => Promise.resolve(JSON.stringify({ error: { errorCode: "NOT_FOUND", message: "Contract not found" } })),
			} as Response);

			try {
				await client.query(TEMPLATE);
			} catch (err) {
				expect(err).toBeInstanceOf(CantonError);
				expect((err as CantonError).status).toBe(404);
				expect((err as CantonError).errorCode).toBe("NOT_FOUND");
			}
		});
	});

	// ---------------------------------------------------------------
	// 8. Error truncation: long messages truncated to 500 chars
	// ---------------------------------------------------------------
	describe("error truncation", () => {
		it("truncates error details longer than 500 characters", async () => {
			const longMessage = "x".repeat(1000);
			vi.spyOn(globalThis, "fetch").mockResolvedValue({
				ok: false,
				status: 400,
				text: () => Promise.resolve(JSON.stringify({ message: longMessage })),
			} as Response);

			const client = new CantonClient({
				jsonApiUrl: BASE_URL,
				retry: { maxRetries: 0 },
			});

			try {
				await client.query(TEMPLATE);
			} catch (err) {
				expect(err).toBeInstanceOf(CantonError);
				const cantonErr = err as CantonError;
				expect(cantonErr.details.length).toBeLessThanOrEqual(503); // 500 + "..."
				expect(cantonErr.details).toMatch(/\.\.\.$/);
			}
		});
	});

	// ---------------------------------------------------------------
	// 9. Auth header: token sent when configured, absent when missing
	// ---------------------------------------------------------------
	describe("auth header", () => {
		it("sends Authorization header when token is configured", async () => {
			const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
				mockFetchResponse({ result: [] }),
			);

			const client = new CantonClient({ jsonApiUrl: BASE_URL, token: "my-jwt" });
			await client.query(TEMPLATE);

			const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
			expect(headers.Authorization).toBe("Bearer my-jwt");
		});

		it("does not send Authorization header when token is missing", async () => {
			const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
				mockFetchResponse({ result: [] }),
			);

			const client = new CantonClient({ jsonApiUrl: BASE_URL });
			await client.query(TEMPLATE);

			const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
			expect(headers.Authorization).toBeUndefined();
		});
	});
});
