# IPTF Bonds

Private bond demo on Aztec.

## Minimal Runbook

If you only want the shortest path to a working frontend, use this:

```bash
# 1) repo root
pnpm install

# 2) build local Noir contracts/bindings
cd packages/contracts
pnpm build

# 3) in another terminal, start Aztec local network
aztec start --local-network

# make sure your local Aztec/L1 stack matches packages/cli/.env
# L2: http://localhost:8080
# L1: http://localhost:8545
# chain id: 31337

# 4) deploy FPC + stablecoin and generate frontend env
cd ../cli
pnpm setup:deploy

# 5) start frontend
cd ../frontend
pnpm dev
```

Then open `http://localhost:3000`, create an account, mint stablecoin on `/tokens`, and deploy a bond on `/issuer`.

## What Matters

- `packages/contracts`: Noir contracts and generated TS artifacts
- `packages/cli`: deployment and demo scripts
- `packages/frontend`: Next.js app
- `packages/api`: not required for the frontend bring-up path

## Required Tooling

- Node.js
- `pnpm`
- `git`
- `aztec` CLI on `PATH`

This repo pins Aztec packages to `4.2.0-aztecnr-rc.2`, so your CLI should match that version.

## Frontend Bring-Up

### 1. Install dependencies

From the repo root:

```bash
pnpm install
```

Important: root `postinstall` runs `scripts/token.ts`, which updates `deps/aztec-standards`, compiles the token contract, and copies generated token artifacts into `packages/contracts/ts/src/artifacts/token`.

### 2. Start Aztec local network

Start a local Aztec network that exposes:

- L2 at `http://localhost:8080`
- L1 at `http://localhost:8545`
- chain id `31337`

The repo expects those values by default.

With the Aztec CLI:

```bash
aztec start --local-network
```

### 3. Build the Noir contracts

From the repo root:

```bash
pnpm --filter @iptf/contracts run build
```

This compiles the workspace in `packages/contracts/contracts` and regenerates TS bindings in `packages/contracts/ts/src/artifacts`.

### 4. Configure CLI env

`packages/cli/.env` should point at your local network:

```bash
L2_NODE_URL=http://localhost:8080
L1_RPC_URL=http://localhost:8545
L1_CHAIN_ID=31337
L1_PRIVATE_KEY=<funded local key>
```

If you are using the standard local network, `packages/cli/.env` is already set up for that.

### 5. Deploy the contracts the frontend needs

From `packages/cli`:

```bash
pnpm setup:deploy
```

This does the important Aztec-side setup:

- bootstraps and funds Sponsored FPC
- creates a minter account
- deploys the stablecoin contract
- writes `packages/cli/scripts/data/deployments.json`
- writes `packages/frontend/.env.local`

The frontend depends on these env vars being populated:

- `NEXT_PUBLIC_AZTEC_NODE_URL`
- `NEXT_PUBLIC_SPONSORED_FPC_ADDRESS`
- `NEXT_PUBLIC_STABLECOIN_ADDRESS`
- `NEXT_PUBLIC_STABLECOIN_MINTER`

Important: `setup:deploy` does not deploy a bond contract. Bonds are deployed from the frontend.

### 6. Run the frontend

From `packages/frontend`:

```bash
pnpm dev
```

Then open `http://localhost:3000`.

## First Local Flow

1. Connect wallet
2. Create account
3. Go to `/tokens` and mint stablecoin
4. Go to `/issuer` and deploy a bond
5. Whitelist another account and distribute bonds if you want to test holder flows

The frontend stores local metadata in `packages/frontend/data/iptf-bonds.db`.

## Important Notes

- Run CLI commands from `packages/cli` so `dotenv/config` picks up `packages/cli/.env`.
- Run the frontend from `packages/frontend` so the SQLite DB is created in the expected place.
- If you reset the local Aztec chain, rerun `pnpm setup:deploy` and clear saved frontend accounts.
- `pnpm test` at the repo root is a placeholder. Use package-level commands instead.

## Commands You Will Actually Use

```bash
pnpm --filter @iptf/contracts run build
pnpm --filter @iptf/contracts run test
pnpm --filter @iptf/frontend run dev
pnpm --filter @iptf/frontend run build
pnpm --filter @iptf/cli run setup:deploy
```

## Not Needed For Basic Frontend Bring-Up

These are not part of the shortest working path:

- `pnpm --filter @iptf/cli run setup:accounts`
- `pnpm --filter @iptf/cli run setup:issuer`
- `pnpm --filter @iptf/cli run escrow:create`
- `pnpm --filter @iptf/cli run escrow:settle`

Use them only if you are intentionally running the extra CLI demo flows.

## License

MIT
