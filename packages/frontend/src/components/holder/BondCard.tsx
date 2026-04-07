"use client";

import { useEffect, useState } from "react";
import { useBondContract } from "@/hooks/useBondContract";
import { useAztecWallet } from "@/hooks/useAztecWallet";
import { useToast } from "@/hooks/useToast";
import { truncateAddress, formatMaturityDate, getTimeRemaining } from "@/lib/bond-utils";
import BondSwapsSection from "./BondSwapsSection";
import type { RegisteredBond } from "./HoldingsList";

interface BondCardProps {
  bond: RegisteredBond;
}

export default function BondCard({ bond }: BondCardProps) {
  const { getBalance, getBlockTimestamp, getBondInfo, redeem } = useBondContract();
  const { address } = useAztecWallet();
  const { showToast } = useToast();

  const [balance, setBalance] = useState<bigint | null>(null);
  const [maturity, setMaturity] = useState<{ expired: boolean; display: string } | null>(null);
  const [maturityDate, setMaturityDate] = useState<bigint | null>(null);
  const [redeemAmount, setRedeemAmount] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSwaps, setShowSwaps] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [bal, blockTime, info] = await Promise.all([
          getBalance(bond.contractAddress),
          getBlockTimestamp(),
          getBondInfo(bond.contractAddress),
        ]);
        setBalance(bal);
        setMaturityDate(info.maturityDate);
        setMaturity(getTimeRemaining(blockTime, info.maturityDate));
      } catch (err) {
        console.error("Failed to load bond data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [bond.contractAddress, getBalance, getBlockTimestamp, getBondInfo]);

  const refreshBalance = async () => {
    const bal = await getBalance(bond.contractAddress);
    setBalance(bal);
  };

  const handleRedeem = async () => {
    if (!redeemAmount) return;
    setRedeeming(true);
    try {
      await redeem(bond.contractAddress, BigInt(redeemAmount));
      showToast(`Redeemed ${redeemAmount} bonds`, "success");
      setRedeemAmount("");
      await refreshBalance();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Redemption failed", "error");
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-neutral-900">{bond.bondName}</h3>
          <p className="text-xs font-mono text-neutral-400">
            {truncateAddress(bond.contractAddress, 10, 6)}
          </p>
        </div>
        {maturity && (
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              maturity.expired
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {maturity.display}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-neutral-500 mb-0.5">Private Balance</p>
          <p className="text-lg font-semibold text-neutral-900">
            {loading ? "..." : balance !== null ? balance.toLocaleString() : "Error"}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 mb-0.5">Maturity Date</p>
          <p className="text-sm text-neutral-700">
            {maturityDate !== null ? formatMaturityDate(maturityDate) : "..."}
          </p>
        </div>
      </div>

      {/* Redeem section */}
      {maturity?.expired && balance && balance > 0n && (
        <div className="pt-4 border-t border-neutral-100">
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              max={balance.toString()}
              value={redeemAmount}
              onChange={(e) => setRedeemAmount(e.target.value)}
              placeholder="Amount to redeem"
              className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              disabled={redeeming}
            />
            <button
              onClick={handleRedeem}
              disabled={redeeming || !redeemAmount}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-neutral-300 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              {redeeming ? "Redeeming..." : "Redeem"}
            </button>
          </div>
        </div>
      )}

      {/* Swaps section */}
      <div className="pt-4 border-t border-neutral-100">
        <button
          onClick={() => setShowSwaps(!showSwaps)}
          className="text-sm font-medium text-neutral-600 hover:text-neutral-800 cursor-pointer"
        >
          {showSwaps ? "Hide Swaps" : "Swaps"}
        </button>
        {showSwaps && address && (
          <div className="mt-3">
            <BondSwapsSection
              bondAddress={bond.contractAddress}
              sellerAddress={address}
              balance={balance}
              onBalanceChange={refreshBalance}
            />
          </div>
        )}
      </div>
    </div>
  );
}
