"use client";

import { useCallback, useRef, useState } from "react";
import { CantonClient } from "../client.js";
import { DemoClient } from "../demo.js";
import type {
	CantonConfig,
	ConnectionState,
	Contract,
	ContractId,
	CreateResult,
	ExerciseResult,
	PartyId,
	QueryFilter,
	TemplateId,
} from "../types.js";

type AnyClient = CantonClient | DemoClient;

/**
 * React hook for Canton Network connection and ledger operations.
 *
 * @example
 *   const { connect, query, create, exercise, state } = useCanton({ demo: true });
 *
 *   await connect();
 *   const assets = await query<Asset>(templateId("#app:Main:Asset"));
 *   const { contractId } = await create(templateId("#app:Main:Asset"), { owner: "Alice" });
 *   await exercise(templateId("#app:Main:Asset"), contractId, "Transfer", { newOwner: "Bob" });
 */
export function useCanton(config: CantonConfig = { jsonApiUrl: "", demo: true }) {
	const [state, setState] = useState<ConnectionState>({ status: "disconnected" });
	const clientRef = useRef<AnyClient | null>(null);

	const getClient = useCallback((): AnyClient => {
		if (!clientRef.current) {
			clientRef.current = config.demo
				? new DemoClient()
				: new CantonClient(config);
		}
		return clientRef.current;
	}, [config]);

	const connect = useCallback(async () => {
		setState({ status: "connecting" });
		try {
			const client = getClient();
			const parties = await client.listParties();
			if (parties.length === 0) {
				throw new Error("No parties available");
			}
			setState({
				status: "connected",
				party: parties[0].party,
				participantId: "local",
			});
			return parties[0].party;
		} catch (err) {
			const message = err instanceof Error ? err.message : "Connection failed";
			setState({ status: "error", error: message });
			throw err;
		}
	}, [getClient]);

	const disconnect = useCallback(async () => {
		clientRef.current = null;
		setState({ status: "disconnected" });
	}, []);

	const query = useCallback(
		async <T = Record<string, unknown>>(
			template: TemplateId,
			filter?: QueryFilter,
		): Promise<Contract<T>[]> => {
			return getClient().query<T>(template, filter);
		},
		[getClient],
	);

	const create = useCallback(
		async <T = Record<string, unknown>>(
			template: TemplateId,
			payload: Record<string, unknown>,
		): Promise<CreateResult<T>> => {
			return getClient().create<T>(template, payload);
		},
		[getClient],
	);

	const exercise = useCallback(
		async <R = unknown>(
			template: TemplateId,
			contractId: ContractId,
			choice: string,
			argument: Record<string, unknown> = {},
		): Promise<ExerciseResult<R>> => {
			return getClient().exercise<R>(template, contractId, choice, argument);
		},
		[getClient],
	);

	const archive = useCallback(
		async (template: TemplateId, contractId: ContractId) => {
			return getClient().archive(template, contractId);
		},
		[getClient],
	);

	return {
		state,
		connect,
		disconnect,
		query,
		create,
		exercise,
		archive,
		isConnected: state.status === "connected",
		party: state.status === "connected" ? state.party : null,
	};
}
