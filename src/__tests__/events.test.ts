import { describe, expect, it, beforeEach, vi } from "vitest";
import { CantonEventEmitter } from "../events.js";

describe("CantonEventEmitter", () => {
	let emitter: CantonEventEmitter;

	beforeEach(() => {
		emitter = new CantonEventEmitter();
	});

	it("on() registers listener and fires on emit", () => {
		const listener = vi.fn();
		emitter.on("contractCreated", listener);

		const payload = { contractId: "c1", templateId: "t1", payload: { key: "value" } };
		emitter.emit("contractCreated", payload);

		expect(listener).toHaveBeenCalledOnce();
		expect(listener).toHaveBeenCalledWith(payload);
	});

	it("off() removes listener", () => {
		const listener = vi.fn();
		emitter.on("contractCreated", listener);
		emitter.off("contractCreated", listener);

		emitter.emit("contractCreated", { contractId: "c1", templateId: "t1", payload: {} });

		expect(listener).not.toHaveBeenCalled();
	});

	it("once() fires only once then auto-removes", () => {
		const listener = vi.fn();
		emitter.once("connected", listener);

		const payload = { party: "Alice::123" as never };
		emitter.emit("connected", payload);
		emitter.emit("connected", payload);

		expect(listener).toHaveBeenCalledOnce();
		expect(emitter.listenerCount("connected")).toBe(0);
	});

	it("once() + off() before fire removes the listener (WeakMap fix)", () => {
		const listener = vi.fn();
		emitter.once("contractArchived", listener);
		emitter.off("contractArchived", listener);

		emitter.emit("contractArchived", { contractId: "c1", templateId: "t1" });

		expect(listener).not.toHaveBeenCalled();
		expect(emitter.listenerCount("contractArchived")).toBe(0);
	});

	it("emit() with error in listener logs error and does not crash", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const badListener = () => {
			throw new Error("boom");
		};
		const goodListener = vi.fn();

		emitter.on("contractCreated", badListener);
		emitter.on("contractCreated", goodListener);

		const payload = { contractId: "c1", templateId: "t1", payload: {} };
		expect(() => emitter.emit("contractCreated", payload)).not.toThrow();
		expect(errorSpy).toHaveBeenCalledOnce();
		expect(goodListener).toHaveBeenCalledOnce();

		errorSpy.mockRestore();
	});

	it("removeAllListeners() clears all listeners", () => {
		emitter.on("contractCreated", vi.fn());
		emitter.on("connected", vi.fn());
		emitter.on("error", vi.fn());

		emitter.removeAllListeners();

		expect(emitter.listenerCount("contractCreated")).toBe(0);
		expect(emitter.listenerCount("connected")).toBe(0);
		expect(emitter.listenerCount("error")).toBe(0);
	});

	it("removeAllListeners(event) clears only that event", () => {
		emitter.on("contractCreated", vi.fn());
		emitter.on("connected", vi.fn());

		emitter.removeAllListeners("contractCreated");

		expect(emitter.listenerCount("contractCreated")).toBe(0);
		expect(emitter.listenerCount("connected")).toBe(1);
	});

	it("listenerCount() returns correct count", () => {
		expect(emitter.listenerCount("contractCreated")).toBe(0);

		emitter.on("contractCreated", vi.fn());
		expect(emitter.listenerCount("contractCreated")).toBe(1);

		emitter.on("contractCreated", vi.fn());
		expect(emitter.listenerCount("contractCreated")).toBe(2);
	});

	it("multiple listeners on same event all fire", () => {
		const listener1 = vi.fn();
		const listener2 = vi.fn();
		const listener3 = vi.fn();

		emitter.on("contractArchived", listener1);
		emitter.on("contractArchived", listener2);
		emitter.on("contractArchived", listener3);

		const payload = { contractId: "c1", templateId: "t1" };
		emitter.emit("contractArchived", payload);

		expect(listener1).toHaveBeenCalledWith(payload);
		expect(listener2).toHaveBeenCalledWith(payload);
		expect(listener3).toHaveBeenCalledWith(payload);
	});

	it("return cleanup function from on() removes the listener", () => {
		const listener = vi.fn();
		const cleanup = emitter.on("connected", listener);

		cleanup();

		emitter.emit("connected", { party: "Alice::123" as never });

		expect(listener).not.toHaveBeenCalled();
		expect(emitter.listenerCount("connected")).toBe(0);
	});
});
