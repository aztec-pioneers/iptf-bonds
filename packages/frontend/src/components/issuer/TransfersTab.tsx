"use client";

import { useMemo } from "react";
import { Icon } from "@iconify/react";
import { truncateAddress } from "@/lib/bond-utils";
import type { TransferEventData } from "@/hooks/useBondEvents";

interface DisplayTransfer {
  from: string;
  to: string;
  amount: bigint;
  viaEscrow: boolean;
}

interface TransfersTabProps {
  events: TransferEventData[];
  loading: boolean;
  onRefresh: () => void;
  addressLabels: Map<string, string>;
  escrowAddresses: Set<string>;
  labelsLoaded: boolean;
}

function resolveLabel(address: string, addressLabels: Map<string, string>, labelsLoaded: boolean): { label: string; isEscrow: boolean } {
  const label = addressLabels.get(address);
  if (label) return { label, isEscrow: false };
  if (!labelsLoaded) return { label: truncateAddress(address, 6, 4), isEscrow: false };
  return { label: "ESCROW", isEscrow: true };
}

function collapseEscrowTransfers(events: TransferEventData[], escrowAddresses: Set<string>): DisplayTransfer[] {
  // Group escrow-involved events by escrow address
  const toEscrow = new Map<string, TransferEventData>();
  const fromEscrow = new Map<string, TransferEventData>();
  const direct: TransferEventData[] = [];

  for (const evt of events) {
    if (escrowAddresses.has(evt.to)) {
      toEscrow.set(evt.to, evt);
    } else if (escrowAddresses.has(evt.from)) {
      fromEscrow.set(evt.from, evt);
    } else {
      direct.push(evt);
    }
  }

  const result: DisplayTransfer[] = [];

  // Collapse matched pairs: seller→escrow + escrow→buyer = seller→buyer (via escrow)
  for (const [escrowAddr, incoming] of toEscrow) {
    const outgoing = fromEscrow.get(escrowAddr);
    if (outgoing) {
      result.push({
        from: incoming.from,
        to: outgoing.to,
        amount: incoming.amount,
        viaEscrow: true,
      });
      fromEscrow.delete(escrowAddr);
    } else {
      // Locked but not yet settled
      result.push({ ...incoming, viaEscrow: false });
    }
  }

  // Remaining unmatched outgoing (shouldn't normally happen)
  for (const [, outgoing] of fromEscrow) {
    result.push({ ...outgoing, viaEscrow: false });
  }

  // Direct transfers
  for (const evt of direct) {
    result.push({ ...evt, viaEscrow: false });
  }

  return result;
}

export default function TransfersTab({ events, loading, onRefresh, addressLabels, escrowAddresses, labelsLoaded }: TransfersTabProps) {
  const displayTransfers = useMemo(
    () => collapseEscrowTransfers(events, escrowAddresses),
    [events, escrowAddresses]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-700">Transfer History</h3>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
        >
          <Icon icon="solar:refresh-linear" width={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {displayTransfers.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-4">
          {loading ? "Loading events..." : "No transfers found. Click Refresh to fetch events."}
        </p>
      ) : (
        <div className="rounded-lg border border-neutral-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500">From</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-neutral-500">To</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-neutral-500">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {displayTransfers.map((evt, i) => {
                const from = resolveLabel(evt.from, addressLabels, labelsLoaded);
                const to = resolveLabel(evt.to, addressLabels, labelsLoaded);
                return (
                  <tr key={i}>
                    <td className="px-4 py-2">
                      {from.isEscrow ? (
                        <span className="text-xs font-medium text-neutral-400 uppercase">Escrow</span>
                      ) : (
                        <span className="text-sm text-neutral-700">{from.label}</span>
                      )}
                      <span className="block text-[10px] font-mono text-neutral-400">{truncateAddress(evt.from, 4, 4)}</span>
                    </td>
                    <td className="px-4 py-2">
                      <div>
                        <div className="flex items-center gap-2">
                          {to.isEscrow ? (
                            <span className="text-xs font-medium text-neutral-400 uppercase">Escrow</span>
                          ) : (
                            <span className="text-sm text-neutral-700">{to.label}</span>
                          )}
                          {evt.viaEscrow && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">
                              via escrow
                            </span>
                          )}
                        </div>
                        <span className="block text-[10px] font-mono text-neutral-400">{truncateAddress(evt.to, 4, 4)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-700">
                      {Number(evt.amount).toLocaleString()}
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
