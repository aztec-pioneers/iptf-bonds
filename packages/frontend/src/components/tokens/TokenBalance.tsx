"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import { useTokenContract } from "@/hooks/useTokenContract";
import { useToast } from "@/hooks/useToast";

const TOKEN_DECIMALS = 6;
const MAX_MINT = 1_000_000;

function formatTokenBalance(raw: bigint): string {
  const whole = raw / BigInt(10 ** TOKEN_DECIMALS);
  return whole.toLocaleString();
}

export default function TokenBalance() {
  const { getBalance, mint } = useTokenContract();
  const { showToast } = useToast();

  const [balance, setBalance] = useState<bigint | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [mintAmount, setMintAmount] = useState("");
  const [minting, setMinting] = useState(false);

  const fetchBalance = useCallback(async () => {
    setLoadingBalance(true);
    try {
      const bal = await getBalance();
      setBalance(bal);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to fetch balance",
        "error"
      );
    } finally {
      setLoadingBalance(false);
    }
  }, [getBalance, showToast]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const handleMint = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(mintAmount);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_MINT) return;

    setMinting(true);
    try {
      const rawAmount = BigInt(parsed) * BigInt(10 ** TOKEN_DECIMALS);
      await mint(rawAmount);
      setBalance((prev) => (prev ?? 0n) + rawAmount);
      showToast(`Minted ${parsed.toLocaleString()} USDC`, "success");
      setMintAmount("");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to mint tokens",
        "error"
      );
    } finally {
      setMinting(false);
    }
  };

  const parsedAmount = Number(mintAmount);
  const isValidAmount =
    mintAmount !== "" &&
    Number.isInteger(parsedAmount) &&
    parsedAmount >= 1 &&
    parsedAmount <= MAX_MINT;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">USDC Balance</h2>
          <p className="text-3xl font-bold text-neutral-900 mt-1">
            {loadingBalance && balance === null ? (
              <span className="text-neutral-400">Loading...</span>
            ) : balance !== null ? (
              formatTokenBalance(balance)
            ) : (
              <span className="text-neutral-400">--</span>
            )}
          </p>
        </div>
        <button
          onClick={fetchBalance}
          disabled={loadingBalance}
          className="p-2 rounded-lg hover:bg-neutral-100 transition-colors text-neutral-500 disabled:opacity-50 cursor-pointer"
          title="Refresh balance"
        >
          <Icon
            icon="lucide:refresh-cw"
            width={18}
            className={loadingBalance ? "animate-spin" : ""}
          />
        </button>
      </div>

      <hr className="border-neutral-100" />

      <form onSubmit={handleMint} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">
            Mint Amount <span className="text-neutral-400">(1 - {MAX_MINT.toLocaleString()} tokens)</span>
          </label>
          <input
            type="number"
            min="1"
            max={MAX_MINT}
            step="1"
            value={mintAmount}
            onChange={(e) => setMintAmount(e.target.value)}
            placeholder="e.g. 1000"
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>
        <button
          type="submit"
          disabled={minting || !isValidAmount}
          className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-neutral-300 text-white text-sm font-medium transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          {minting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Minting...
            </>
          ) : (
            "Mint Tokens"
          )}
        </button>
      </form>
    </div>
  );
}
