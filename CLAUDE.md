# Canton SDK

## Overview
Simplified TypeScript SDK for Canton Network dApp development. Zero runtime dependencies. Drop-in replacement for @canton-network/dapp-sdk with 90% less complexity.

## Stack
- **Language:** TypeScript (strict)
- **Build:** tsup (CJS + ESM + DTS)
- **Test:** Vitest
- **Linter:** Biome
- **Package Manager:** bun

## Structure
```
src/
  index.ts               # Main entry: CantonClient, DemoClient, types
  react.ts               # React entry: useCanton, useContracts hooks
  types.ts               # Branded types: PartyId, ContractId, TemplateId, CantonError
  client.ts              # CantonClient — JSON Ledger API v2 client
  demo.ts                # DemoClient — in-memory ledger simulator
  hooks/
    use-canton.ts         # React hook for wallet + CRUD
    use-contracts.ts      # React hook for live contract queries
  __tests__/
    demo-client.test.ts   # 13 tests for DemoClient
    types.test.ts         # 4 tests for types
```

## Dev Commands
```bash
bun install        # Install
bun run test       # Run 17 Vitest tests
bun run build      # Build CJS + ESM + DTS
bun run dev        # Watch mode build
```

## Key Design Decisions
- Zero runtime dependencies (only fetch API)
- Branded types for compile-time safety (PartyId, ContractId, TemplateId)
- DemoClient shares exact same API as CantonClient
- React hooks are optional (peer dependency)
- CantonError class with status, errorCode, details for structured errors
