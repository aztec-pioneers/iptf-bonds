"use client";

import { Icon } from "@iconify/react";
import { truncateAddress } from "@/lib/bond-utils";

interface HoldersTabProps {
  holderBalances: Map<string, bigint>;
  loading: boolean;
  onRefresh: () => void;
  addressLabels: Map<string, string>;
  labelsLoaded: boolean;
}

function resolveLabel(address: string, addressLabels: Map<string, string>, labelsLoaded: boolean): { label: string; isEscrow: boolean } {
  const label = addressLabels.get(address);
  if (label) return { label, isEscrow: false };
  if (!labelsLoaded) return { label: truncateAddress(address, 6, 4), isEscrow: false };
  return { label: "ESCROW", isEscrow: true };
}

export default function HoldersTab({ holderBalances, loading, onRefresh, addressLabels, labelsLoaded }: HoldersTabProps) {
  const holders = Array.from(holderBalances.entries());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-700">Bond Holders</h3>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
        >
          <Icon icon="solar:refresh-linear" width={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {holders.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-4">
          {loading ? "Loading events..." : "No holder data. Click Refresh to fetch events."}
        </p>
      ) : (
        <div className="rounded-lg border border-neutral-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500">Holder</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-neutral-500">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {holders.map(([addr, balance]) => {
                const { label, isEscrow } = resolveLabel(addr, addressLabels, labelsLoaded);
                return (
                  <tr key={addr}>
                    <td className="px-4 py-2">
                      {isEscrow ? (
                        <span className="text-xs font-medium text-neutral-400 uppercase">Escrow</span>
                      ) : (
                        <span className="text-sm text-neutral-700">{label}</span>
                      )}
                      <span className="block text-[10px] font-mono text-neutral-400">{truncateAddress(addr, 4, 4)}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-700">
                      {Number(balance).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
