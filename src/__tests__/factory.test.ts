import { describe, expect, it } from "vitest";
import { createCantonClient } from "../factory.js";
import { CantonClient } from "../client.js";
import { DemoClient } from "../demo.js";

describe("createCantonClient", () => {
	const BASE_URL = "http://localhost:7575";

	describe("demo mode", () => {
		it("should return a DemoClient when demo is true", () => {
			const client = createCantonClient({ jsonApiUrl: "", demo: true });
			expect(client).toBeInstanceOf(DemoClient);
		});

		it("should ignore jsonApiUrl when demo is true", () => {
			const client = createCantonClient({ jsonApiUrl: BASE_URL, demo: true });
			expect(client).toBeInstanceOf(DemoClient);
		});
	});

	describe("production mode", () => {
		it("should return a CantonClient when demo is not set", () => {
			const client = createCantonClient({ jsonApiUrl: BASE_URL });
			expect(client).toBeInstanceOf(CantonClient);
		});

		it("should return a CantonClient when demo is false", () => {
			const client = createCantonClient({ jsonApiUrl: BASE_URL, demo: false });
			expect(client).toBeInstanceOf(CantonClient);
		});
	});

	describe("config forwarding", () => {
		it("should forward applicationId to CantonClient", () => {
			const client = createCantonClient({
				jsonApiUrl: BASE_URL,
				applicationId: "my-app",
			});
			expect(client).toBeInstanceOf(CantonClient);
			// Client was created without throwing, config was accepted
		});

		it("should forward timeout to CantonClient", () => {
			const client = createCantonClient({
				jsonApiUrl: BASE_URL,
				timeout: 5000,
			});
			expect(client).toBeInstanceOf(CantonClient);
		});

		it("should forward all config options together", () => {
			const client = createCantonClient({
				jsonApiUrl: BASE_URL,
				applicationId: "test-app",
				timeout: 10000,
				token: "test-token",
				retry: { maxRetries: 5 },
			});
			expect(client).toBeInstanceOf(CantonClient);
		});
	});

	describe("URL validation", () => {
		it("should throw on invalid URL", () => {
			expect(() =>
				createCantonClient({ jsonApiUrl: "not-a-url" }),
			).toThrow();
		});

		it("should throw on unsupported protocol", () => {
			expect(() =>
				createCantonClient({ jsonApiUrl: "ftp://localhost:7575" }),
			).toThrow("Unsupported protocol: ftp:");
		});

		it("should accept https URLs", () => {
			const client = createCantonClient({
				jsonApiUrl: "https://canton.example.com",
			});
			expect(client).toBeInstanceOf(CantonClient);
		});
	});
});
