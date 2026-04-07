"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import { useBondContract } from "@/hooks/useBondContract";
import { useToast } from "@/hooks/useToast";
import {
  formatUsdcAmount,
  parseUsdcToRaw,
  formatMaturityDate,
  getTimeRemaining,
} from "@/lib/bond-utils";

interface BondRepaymentTabProps {
  bondAddress: string;
}

export default function BondRepaymentTab({ bondAddress }: BondRepaymentTabProps) {
  const { getPublicUsdcBalance, depositUsdc, getBondInfo, getBlockTimestamp } = useBondContract();
  const { showToast } = useToast();

  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);
  const [totalSupply, setTotalSupply] = useState<bigint | null>(null);
  const [maturityDate, setMaturityDate] = useState<bigint | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<{ expired: boolean; display: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // PXE doesn't support concurrent execution — run sequentially
      const info = await getBondInfo(bondAddress);
      setTotalSupply(info.totalSupply);
      setMaturityDate(info.maturityDate);

      const blockTime = await getBlockTimestamp();
      setTimeRemaining(getTimeRemaining(blockTime, info.maturityDate));

      const balance = await getPublicUsdcBalance(bondAddress);
      setUsdcBalance(balance);
    } catch (err) {
      console.error("Failed to load repayment data:", err);
    } finally {
      setLoading(false);
    }
  }, [bondAddress, getPublicUsdcBalance, getBondInfo, getBlockTimestamp]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeposit = async () => {
    if (!depositAmount) return;
    setDepositing(true);
    try {
      const raw = parseUsdcToRaw(depositAmount);
      await depositUsdc(bondAddress, raw);
      showToast(`Deposited ${depositAmount} USDC`, "success");
      setDepositAmount("");
      // Refresh balance
      const newBalance = await getPublicUsdcBalance(bondAddress);
      setUsdcBalance(newBalance);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Deposit failed", "error");
    } finally {
      setDepositing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Info section */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-700">Bond Repayment</h3>
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer"
        >
          <Icon
            icon="solar:refresh-linear"
            width={14}
            className={loading ? "animate-spin" : ""}
          />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-neutral-500 mb-0.5">Public USDC Balance</p>
          <p className="text-lg font-semibold text-neutral-900 font-mono">
            {loading ? "..." : usdcBalance !== null ? formatUsdcAmount(usdcBalance) : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 mb-0.5">Total Bond Supply</p>
          <p className="text-lg font-semibold text-neutral-900 font-mono">
            {loading ? "..." : totalSupply !== null ? Number(totalSupply).toLocaleString() : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 mb-0.5">Maturity Date</p>
          <p className="text-sm text-neutral-700">
            {loading ? "..." : maturityDate !== null ? formatMaturityDate(maturityDate) : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 mb-0.5">Time Remaining</p>
          {timeRemaining && (
            <span
              className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                timeRemaining.expired
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {timeRemaining.display}
            </span>
          )}
          {!timeRemaining && <p className="text-sm text-neutral-700">{loading ? "..." : "—"}</p>}
        </div>
      </div>

      {/* Coverage indicator */}
      {usdcBalance !== null && totalSupply !== null && totalSupply > 0n && (
        <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-100">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-600">Redemption Coverage</span>
            <span className={`font-medium font-mono ${
              usdcBalance >= totalSupply * 1000000n
                ? "text-green-600"
                : "text-amber-600"
            }`}>
              {formatUsdcAmount(usdcBalance)} / {formatUsdcAmount(totalSupply * 1000000n)} USDC
            </span>
          </div>
        </div>
      )}

      {/* Deposit form */}
      <div className="pt-4 border-t border-neutral-100 space-y-3">
        <p className="text-sm font-medium text-neutral-700">Deposit USDC</p>
        <p className="text-xs text-neutral-500">
          Transfer USDC from your private balance into the bond contract&apos;s public balance for holder redemptions.
        </p>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              inputMode="decimal"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="Amount (e.g. 1000.00)"
              className="w-full px-3 py-2 pr-14 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              disabled={depositing}
            />
            <button
              type="button"
              onClick={() => {
                if (totalSupply !== null && usdcBalance !== null) {
                  const coverageNeeded = totalSupply * 1_000_000n - usdcBalance;
                  setDepositAmount(coverageNeeded > 0n ? formatUsdcAmount(coverageNeeded) : "0.00");
                }
              }}
              disabled={depositing}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-xs font-medium text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
            >
              MAX
            </button>
          </div>
          <button
            onClick={handleDeposit}
            disabled={depositing || !depositAmount}
            className="px-6 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-neutral-300 text-white text-sm font-medium transition-colors cursor-pointer flex items-center gap-2"
          >
            {depositing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Depositing...
              </>
            ) : (
              "Deposit"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
