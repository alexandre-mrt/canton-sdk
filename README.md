# Canton SDK

The simplest way to build on **Canton Network** with TypeScript.

![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)
![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-green)
![Tests](https://img.shields.io/badge/Tests-17%20passing-green)
![Canton](https://img.shields.io/badge/Canton-Network-0052ff)
![License](https://img.shields.io/badge/License-MIT-green)

## Why?

The official Canton SDKs are powerful but complex:

| | Official `@canton-network/dapp-sdk` | Official `wallet-sdk` | **`canton-sdk`** |
|---|---|---|---|
| Dependencies | 7 internal packages | 16 deps (gRPC, protobuf, jose) | **0** |
| Setup | Wallet Gateway + extension | 6-step init ceremony | `new CantonClient({ url, token })` |
| Simple transfer | ~15 lines | ~25 lines (prepare/sign/execute/wait) | **1 line** |
| React hooks | None (hand-roll your own) | N/A (Node only) | `useCanton()` + `useContracts()` |
| Test suite | `echo "Warning: no test"` | `echo "Warning: no test"` | **17 tests** |
| Dev mode | Requires Canton node | Requires Canton node | **Built-in demo mode** |
| Environment | Browser only | Node.js only | **Both** |

Based on analysis of the official [splice-wallet-kernel](https://github.com/hyperledger-labs/splice-wallet-kernel) repo (739 TS files, 22+ internal packages).

## Quick Start

```bash
bun add canton-sdk
```

```typescript
import { CantonClient, templateId } from "canton-sdk";

// Connect to Canton JSON API
const canton = new CantonClient({
  jsonApiUrl: "http://localhost:7575",
  token: "your-jwt-token",
});

// Query contracts
const assets = await canton.query(templateId("#my-app:Main:Asset"));

// Create a contract
const { contractId } = await canton.create(
  templateId("#my-app:Main:Asset"),
  { issuer: "Alice", owner: "Alice", name: "Gold", amount: "100.0" }
);

// Exercise a choice
await canton.exercise(
  templateId("#my-app:Main:Asset"),
  contractId,
  "Transfer",
  { newOwner: "Bob" }
);

// Archive
await canton.archive(templateId("#my-app:Main:Asset"), contractId);
```

## Demo Mode (No Canton Node)

```typescript
import { DemoClient, templateId } from "canton-sdk";

const canton = new DemoClient(); // In-memory ledger
// Same API as CantonClient — swap when ready for production
```

## React Hooks

```typescript
import { useCanton, useContracts } from "canton-sdk/react";
import { templateId } from "canton-sdk";

function App() {
  const { connect, query, create, exercise, isConnected, party } = useCanton({
    jsonApiUrl: "http://localhost:7575",
    demo: true, // Set to false for production
  });

  // Auto-refreshing contract list
  const { contracts, loading, refresh } = useContracts(
    query,
    templateId("#my-app:Main:Asset"),
    { owner: party }, // filter
    5000, // refresh every 5 seconds
  );

  return (
    <div>
      {!isConnected ? (
        <button onClick={connect}>Connect</button>
      ) : (
        <ul>
          {contracts.map(c => <li key={c.contractId}>{JSON.stringify(c.payload)}</li>)}
        </ul>
      )}
    </div>
  );
}
```

## API Reference

### `CantonClient`

| Method | Description |
|--------|-------------|
| `query<T>(template, filter?)` | Query active contracts |
| `create<T>(template, payload)` | Create a new contract |
| `exercise<R>(template, contractId, choice, argument?)` | Exercise a choice |
| `archive(template, contractId)` | Archive (delete) a contract |
| `fetch<T>(template, contractId)` | Fetch a single contract |
| `listParties()` | List known parties |
| `allocateParty(displayName)` | Allocate a new party |
| `listPackages()` | List uploaded packages |
| `getLedgerEnd()` | Get current ledger end offset |
| `isHealthy()` | Health check |

### `DemoClient`

Same API as `CantonClient` plus:

| Method | Description |
|--------|-------------|
| `getDefaultParty()` | Get the demo party ID |
| `getContractCount()` | Count active contracts |
| `reset()` | Clear all state |

### React Hooks

| Hook | Description |
|------|-------------|
| `useCanton(config?)` | Wallet connection + CRUD operations |
| `useContracts<T>(queryFn, template, filter?, interval?)` | Auto-refreshing contract queries |

### Types

| Type | Description |
|------|-------------|
| `PartyId` | Branded string for party identifiers |
| `ContractId<T>` | Branded string with template type parameter |
| `TemplateId` | Branded string for template identifiers |
| `Contract<T>` | Active contract with typed payload |
| `CantonError` | Structured error with status, code, details |
| `ConnectionState` | Union type for wallet connection state |

## Comparison with Official SDK

```
Official @canton-network/dapp-sdk:
  Your App → dApp SDK → Wallet Gateway → Browser Extension → RPC Client → Canton Node

canton-sdk:
  Your App → CantonClient → fetch() → Canton JSON API
```

## Testing

```bash
bun run test        # 17 tests
bun run test:watch  # Watch mode
```

## Grant Eligibility

This project targets the [Canton Foundation Grants Program](https://canton.foundation/grants-program/):
- **Category:** Developer Tools
- **Focus:** Drastically reducing Canton dApp development friction

## License

MIT
