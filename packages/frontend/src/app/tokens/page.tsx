"use client";

import RequireWallet from "@/components/layout/RequireWallet";
import TokenBalance from "@/components/tokens/TokenBalance";

export default function TokensPage() {
  return (
    <RequireWallet>
      <main className="flex-grow max-w-4xl mx-auto w-full px-6 py-10 space-y-10">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 mb-1">Payment Tokens</h1>
          <p className="text-sm text-neutral-500">
            Mint USDC stablecoin tokens for purchasing and repaying bonds. This is a demo faucet.
          </p>
        </div>

        <TokenBalance />
      </main>
    </RequireWallet>
  );
}
