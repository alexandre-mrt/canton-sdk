"use client";

import { useCallback, useEffect, useState } from "react";
import type { Contract, QueryFilter, TemplateId } from "../types.js";

type QueryFn = <T>(
	template: TemplateId,
	filter?: QueryFilter,
) => Promise<Contract<T>[]>;

/**
 * React hook for live contract queries with auto-refresh.
 *
 * @example
 *   const { contracts, loading, error, refresh } = useContracts<Asset>(
 *     query,
 *     templateId("#app:Main:Asset"),
 *     { owner: "Alice" },
 *     5000 // refresh every 5 seconds
 *   );
 */
export function useContracts<T = Record<string, unknown>>(
	queryFn: QueryFn,
	template: TemplateId,
	filter?: QueryFilter,
	refreshInterval?: number,
) {
	const [contracts, setContracts] = useState<Contract<T>[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			setError(null);
			const results = await queryFn<T>(template, filter);
			setContracts(results);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Query failed");
		} finally {
			setLoading(false);
		}
	}, [queryFn, template, filter]);

	useEffect(() => {
		refresh();

		if (refreshInterval && refreshInterval > 0) {
			const interval = setInterval(refresh, refreshInterval);
			return () => clearInterval(interval);
		}
	}, [refresh, refreshInterval]);

	return { contracts, loading, error, refresh };
}
