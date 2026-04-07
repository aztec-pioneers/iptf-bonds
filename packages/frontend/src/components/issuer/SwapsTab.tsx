"use client";

import { useState, useEffect, useCallback } from "react";
import { useEscrowContract } from "@/hooks/useEscrowContract";
import { useBondContract } from "@/hooks/useBondContract";
import { useAztecWallet } from "@/hooks/useAztecWallet";
import { useToast } from "@/hooks/useToast";
import { listEscrowOrders, type EscrowOrderRow } from "@/lib/api";
import { formatUsdcAmount, formatUnitPrice, parseUsdcToRaw } from "@/lib/bond-utils";

interface SwapsTabProps {
  bondAddress: string;
}

export default function SwapsTab({ bondAddress }: SwapsTabProps) {
  const { address } = useAztecWallet();
  const { createSellOrder } = useEscrowContract();
  const { getBalance } = useBondContract();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<EscrowOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<bigint | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [bondAmount, setBondAmount] = useState("");
  const [usdcPrice, setUsdcPrice] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    listEscrowOrders(bondAddress, { status: "all" })
      .then(setOrders)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [bondAddress]);

  const refreshBalance = useCallback(async () => {
    try {
      const bal = await getBalance(bondAddress);
      setBalance(bal);
    } catch {
      setBalance(null);
    }
  }, [bondAddress, getBalance]);

  useEffect(() => {
    refresh();
    refreshBalance();
  }, [refresh, refreshBalance]);

  const handleCreate = async () => {
    if (!bondAmount || !usdcPrice) return;
    setCreating(true);
    try {
      const paymentRaw = parseUsdcToRaw(usdcPrice);
      await createSellOrder(bondAddress, BigInt(bondAmount), paymentRaw);
      showToast("Sell order created", "success");
      setBondAmount("");
      setUsdcPrice("");
      setShowCreate(false);
      refresh();
      refreshBalance();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create order", "error");
    } finally {
      setCreating(false);
    }
  };

  const computedUnitPrice = bondAmount && usdcPrice
    ? formatUnitPrice(parseUsdcToRaw(usdcPrice).toString(), bondAmount)
    : null;

  const myOrders = address ? orders.filter((o) => o.seller_address === address) : [];

  return (
    <div className="space-y-6">
      {/* Create Sell Order */}
      <div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="text-sm font-medium text-orange-600 hover:text-orange-700 cursor-pointer"
          >
            {showCreate ? "Cancel" : "+ Create Sell Order"}
          </button>
          {balance !== null && (
            <span className="text-xs text-neutral-400">
              Your balance: {balance.toString()} bonds
            </span>
          )}
        </div>
        {showCreate && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                max={balance?.toString() ?? ""}
                value={bondAmount}
                onChange={(e) => setBondAmount(e.target.value)}
                placeholder="Bond amount"
                className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                disabled={creating}
              />
              <input
                type="text"
                value={usdcPrice}
                onChange={(e) => setUsdcPrice(e.target.value)}
                placeholder="USDC price (e.g. 99.50)"
                className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                disabled={creating}
              />
            </div>
            {computedUnitPrice && (
              <p className="text-xs text-neutral-500">
                Unit price: ${computedUnitPrice} per bond
              </p>
            )}
            <button
              onClick={handleCreate}
              disabled={creating || !bondAmount || !usdcPrice}
              className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-neutral-300 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              {creating ? "Creating..." : "Create Sell Order"}
            </button>
          </div>
        )}
      </div>

      {/* All Escrow Orders */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-neutral-700">All Escrow Orders</h3>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-xs text-orange-600 hover:text-orange-700 disabled:text-neutral-400 cursor-pointer"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {orders.length === 0 && !loading ? (
          <p className="text-sm text-neutral-400 text-center py-8">No escrow orders yet</p>
        ) : (
          <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100">
            <div className="grid grid-cols-4 gap-2 px-4 py-2 text-xs font-medium text-neutral-500 bg-neutral-50 rounded-t-lg">
              <span>Bonds</span>
              <span>USDC Price</span>
              <span>Unit Price</span>
              <span>Status</span>
            </div>
            {orders.map((order) => (
              <div key={order.escrow_address} className="grid grid-cols-4 gap-2 px-4 py-3 items-center">
                <span className="text-sm text-neutral-900">{order.bond_amount}</span>
                <span className="text-sm text-neutral-700">${formatUsdcAmount(order.payment_amount)}</span>
                <span className="text-xs text-neutral-500">${formatUnitPrice(order.payment_amount, order.bond_amount)}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium w-fit ${
                    order.status === "open"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {order.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My Sell Orders summary */}
      {myOrders.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-2">My Sell Orders</h3>
          <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100">
            {myOrders.map((order) => (
              <div key={order.escrow_address} className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-neutral-900">{order.bond_amount} bonds</span>
                  <span className="text-sm text-neutral-700">${formatUsdcAmount(order.payment_amount)}</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    order.status === "open"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {order.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
