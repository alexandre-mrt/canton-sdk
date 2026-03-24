/**
 * EventEmitter for Canton SDK.
 *
 * Provides a typed, lightweight event system for contract lifecycle events.
 * Zero dependencies. Used internally by CantonClient and available for consumers.
 *
 * @example
 *   const emitter = new CantonEventEmitter();
 *   emitter.on("contractCreated", (event) => console.log(event.contractId));
 *   emitter.emit("contractCreated", { contractId: "abc", templateId: "...", payload: {} });
 */

import type {
	CantonEventListener,
	CantonEventMap,
	CantonEventType,
} from "./types.js";

/**
 * Typed event emitter for Canton SDK events.
 * Supports on/off/once patterns for contract lifecycle, connection, and error events.
 */
export class CantonEventEmitter {
	private listeners = new Map<CantonEventType, Set<CantonEventListener<CantonEventType>>>();
	private onceWrappers = new WeakMap<CantonEventListener<CantonEventType>, CantonEventListener<CantonEventType>>();

	/**
	 * Register an event listener.
	 * @param event - The event type to listen for
	 * @param listener - Callback function invoked when the event fires
	 * @returns A cleanup function that removes the listener
	 */
	on<K extends CantonEventType>(
		event: K,
		listener: CantonEventListener<K>,
	): () => void {
		const set = this.listeners.get(event) ?? new Set();
		set.add(listener as CantonEventListener<CantonEventType>);
		this.listeners.set(event, set);
		return () => this.off(event, listener);
	}

	/**
	 * Register a one-time event listener that automatically removes itself after firing.
	 * @param event - The event type to listen for
	 * @param listener - Callback function invoked once when the event fires
	 * @returns A cleanup function that removes the listener
	 */
	once<K extends CantonEventType>(
		event: K,
		listener: CantonEventListener<K>,
	): () => void {
		const wrapper = ((data: CantonEventMap[K]) => {
			this.off(event, wrapper);
			listener(data);
		}) as CantonEventListener<K>;
		this.onceWrappers.set(
			listener as CantonEventListener<CantonEventType>,
			wrapper as CantonEventListener<CantonEventType>,
		);
		return this.on(event, wrapper);
	}

	/**
	 * Remove an event listener.
	 * @param event - The event type to stop listening for
	 * @param listener - The callback function to remove
	 */
	off<K extends CantonEventType>(
		event: K,
		listener: CantonEventListener<K>,
	): void {
		const set = this.listeners.get(event);
		if (!set) return;

		const cast = listener as CantonEventListener<CantonEventType>;
		const wrapper = this.onceWrappers.get(cast);

		set.delete(cast);
		if (wrapper) {
			set.delete(wrapper);
			this.onceWrappers.delete(cast);
		}

		if (set.size === 0) {
			this.listeners.delete(event);
		}
	}

	/**
	 * Emit an event to all registered listeners.
	 * @param event - The event type to emit
	 * @param data - The event payload
	 */
	emit<K extends CantonEventType>(event: K, data: CantonEventMap[K]): void {
		const set = this.listeners.get(event);
		if (!set) return;
		for (const listener of set) {
			try {
				listener(data);
			} catch (error: unknown) {
				if (event !== "error") {
					console.error(`[CantonEventEmitter] Listener error on "${event}":`, error);
				}
			}
		}
	}

	/**
	 * Remove all listeners for a specific event, or all listeners if no event specified.
	 * @param event - Optional event type to clear listeners for
	 */
	removeAllListeners(event?: CantonEventType): void {
		if (event) {
			this.listeners.delete(event);
		} else {
			this.listeners.clear();
		}
	}

	/**
	 * Get the number of listeners for a specific event.
	 * @param event - The event type to count listeners for
	 * @returns The number of registered listeners
	 */
	listenerCount(event: CantonEventType): number {
		return this.listeners.get(event)?.size ?? 0;
	}
}
