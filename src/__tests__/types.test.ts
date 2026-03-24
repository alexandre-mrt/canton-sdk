import { describe, expect, it } from "vitest";
import { CantonError, partyId, templateId } from "../types.js";

describe("types", () => {
	describe("templateId", () => {
		it("should create a branded template ID", () => {
			const tid = templateId("#my-app:Main:Asset");
			expect(tid).toBe("#my-app:Main:Asset");
			// TypeScript enforces branding at compile time
		});
	});

	describe("partyId", () => {
		it("should create a branded party ID", () => {
			const pid = partyId("Alice::1234567890");
			expect(pid).toBe("Alice::1234567890");
		});
	});

	describe("CantonError", () => {
		it("should create error with status, code, and details", () => {
			const error = new CantonError(404, "NOT_FOUND", "Contract not found");
			expect(error.status).toBe(404);
			expect(error.errorCode).toBe("NOT_FOUND");
			expect(error.details).toBe("Contract not found");
			expect(error.message).toContain("404");
			expect(error.message).toContain("NOT_FOUND");
			expect(error.name).toBe("CantonError");
		});

		it("should be an instance of Error", () => {
			const error = new CantonError(500, "INTERNAL", "Something went wrong");
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(CantonError);
		});
	});
});
