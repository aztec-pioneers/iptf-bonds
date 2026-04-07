"use client";

import { useState, useEffect, useCallback } from "react";
import { useEscrowContract } from "@/hooks/useEscrowContract";
import { useToast } from "@/hooks/useToast";
import { formatUsdcAmount, formatUnitPrice, parseUsdcToRaw } from "@/lib/bond-utils";
import type { EscrowOrderRow } from "@/lib/api";

interface BondSwapsSectionProps {
  bondAddress: string;
  sellerAddress: string;
  balance: bigint | null;
  onBalanceChange: () => void;
}

export default function BondSwapsSection({ bondAddress, sellerAddress, balance, onBalanceChange }: BondSwapsSectionProps) {
  const { createSellOrder, fillOrder, listOrders, listMyOrders } = useEscrowContract();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<EscrowOrderRow[]>([]);
  const [myOrders, setMyOrders] = useState<EscrowOrderRow[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [bondAmount, setBondAmount] = useState("");
  const [usdcPrice, setUsdcPrice] = useState("");
  const [creating, setCreating] = useState(false);

  // Fill state
  const [fillingAddr, setFillingAddr] = useState<string | null>(null);

  const refreshOrders = useCallback(async () => {
    try {
      const [allOrders, mine] = await Promise.all([
        listOrders(bondAddress),
        listMyOrders(bondAddress),
      ]);
      setOrders(allOrders);
      setMyOrders(mine);
    } catch (err) {
      console.error("Failed to load orders:", err);
    } finally {
      setLoadingOrders(false);
    }
  }, [bondAddress, listOrders, listMyOrders]);

  useEffect(() => {
    refreshOrders();
  }, [refreshOrders]);

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
      refreshOrders();
      onBalanceChange();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create order", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleFill = async (order: EscrowOrderRow) => {
    setFillingAddr(order.escrow_address);
    try {
      await fillOrder(order.escrow_address, order.secret_key, BigInt(order.payment_amount));
      showToast("Order filled successfully", "success");
      refreshOrders();
      onBalanceChange();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to fill order", "error");
    } finally {
      setFillingAddr(null);
    }
  };

  const computedUnitPrice = bondAmount && usdcPrice
    ? formatUnitPrice(parseUsdcToRaw(usdcPrice).toString(), bondAmount)
    : null;

  return (
    <div className="space-y-5">
      {/* Create Sell Order */}
      <div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="text-sm font-medium text-orange-600 hover:text-orange-700 cursor-pointer"
        >
          {showCreate ? "Cancel" : "+ Create Sell Order"}
        </button>
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

      {/* Open Orders (Orderbook) */}
      <div>
        <h4 className="text-sm font-medium text-neutral-700 mb-2">Open Orders</h4>
        {loadingOrders ? (
          <p className="text-xs text-neutral-400">Loading...</p>
        ) : orders.length === 0 ? (
          <p className="text-xs text-neutral-400">No open orders</p>
        ) : (
          <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100">
            {orders.map((order) => (
              <div key={order.escrow_address} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-4 min-w-0">
                  <span className="text-sm text-neutral-900">{order.bond_amount} bonds</span>
                  <span className="text-sm text-neutral-700">${formatUsdcAmount(order.payment_amount)}</span>
                  <span className="text-xs text-neutral-400">
                    ${formatUnitPrice(order.payment_amount, order.bond_amount)}/bond
                  </span>
                </div>
                {order.seller_address !== sellerAddress && (
                  <button
                    onClick={() => handleFill(order)}
                    disabled={fillingAddr === order.escrow_address}
                    className="px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-neutral-300 text-white text-xs font-medium transition-colors cursor-pointer shrink-0 ml-4"
                  >
                    {fillingAddr === order.escrow_address ? "Buying..." : "Buy"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My Sell Orders */}
      {myOrders.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-neutral-700 mb-2">My Sell Orders</h4>
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
