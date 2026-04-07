"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Icon } from "@iconify/react";
import { useBondContract } from "@/hooks/useBondContract";
import { useToast } from "@/hooks/useToast";
import { listWhitelist, type AddressBookEntry } from "@/lib/api";
import { truncateAddress } from "@/lib/bond-utils";
import ProgressBar from "@/components/ui/ProgressBar";

interface Distribution {
  address: string;
  label: string;
  amount: string;
}

interface DistributeTabProps {
  bondAddress: string;
}

export default function DistributeTab({ bondAddress }: DistributeTabProps) {
  const { batchDistribute, getBalance } = useBondContract();
  const { showToast } = useToast();

  const [rows, setRows] = useState<Distribution[]>([{ address: "", label: "", amount: "" }]);
  const [distributing, setDistributing] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  // Bond balance
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);

  // Address book
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>([]);
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [searchTerms, setSearchTerms] = useState<Record<number, string>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchBalance = useCallback(async () => {
    setLoadingBalance(true);
    try {
      const bal = await getBalance(bondAddress);
      setBalance(bal);
    } catch {
      setBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  }, [bondAddress, getBalance]);

  useEffect(() => {
    fetchBalance();
    listWhitelist(bondAddress).then(setAddressBook).catch(console.error);
  }, [bondAddress, fetchBalance]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addRow = () => setRows([...rows, { address: "", label: "", amount: "" }]);

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof Distribution, value: string) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    setRows(updated);
  };

  const selectFromBook = (index: number, entry: AddressBookEntry) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], address: entry.holder_address, label: entry.label ?? "" };
    setRows(updated);
    setOpenDropdown(null);
    setSearchTerms((prev) => ({ ...prev, [index]: "" }));
  };

  const getFilteredEntries = (index: number) => {
    const term = (searchTerms[index] ?? "").toLowerCase();
    const usedAddresses = new Set(rows.filter((_, i) => i !== index).map((r) => r.address));
    return addressBook.filter(
      (e) =>
        !usedAddresses.has(e.holder_address) &&
        ((e.label ?? "").toLowerCase().includes(term) ||
          e.holder_address.toLowerCase().includes(term))
    );
  };

  const totalDistributing = rows.reduce((sum, r) => {
    const amt = r.amount ? BigInt(r.amount) : 0n;
    return sum + amt;
  }, 0n);

  const overBudget = balance !== null && totalDistributing > balance;

  const handleDistribute = async () => {
    const validRows = rows.filter((r) => r.address && r.amount);
    if (validRows.length === 0) return;

    setDistributing(true);
    setProgress({ completed: 0, total: validRows.length });

    try {
      const distributions = validRows.map((r) => ({
        address: r.address,
        amount: BigInt(r.amount),
      }));

      const totalAmount = distributions.reduce((sum, d) => sum + d.amount, 0n);

      await batchDistribute(bondAddress, distributions, (completed, total) => {
        setProgress({ completed, total });
      });

      showToast(`Distributed to ${validRows.length} addresses`, "success");
      setRows([{ address: "", label: "", amount: "" }]);

      // Optimistic balance update
      if (balance !== null) {
        setBalance(balance - totalAmount);
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Distribution failed",
        "error"
      );
      // Refetch actual balance on failure
      fetchBalance();
    } finally {
      setDistributing(false);
      setProgress({ completed: 0, total: 0 });
    }
  };

  const validCount = rows.filter((r) => r.address && r.amount).length;

  return (
    <div className="space-y-4">
      {/* Balance display */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-700">Distribute Bonds</h3>
        <div className="flex items-center gap-2">
          <p className="text-sm text-neutral-600">
            Balance:{" "}
            <span className="font-medium font-mono">
              {loadingBalance ? "..." : balance !== null ? Number(balance).toLocaleString() : "—"}
            </span>
          </p>
          <button
            onClick={fetchBalance}
            disabled={loadingBalance}
            className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer"
          >
            <Icon
              icon="solar:refresh-linear"
              width={14}
              className={loadingBalance ? "animate-spin" : ""}
            />
          </button>
        </div>
      </div>

      <p className="text-xs text-amber-600">Addresses must be whitelisted before distribution</p>

      <div className="space-y-2" ref={dropdownRef}>
        {rows.map((row, index) => (
          <div key={index} className="flex gap-2 items-center">
            {/* Address book search dropdown */}
            <div className="flex-1 relative">
              <div
                onClick={() => !distributing && setOpenDropdown(openDropdown === index ? null : index)}
                className={`w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm cursor-pointer flex items-center justify-between ${
                  distributing ? "bg-neutral-50 text-neutral-400" : "hover:border-neutral-300"
                }`}
              >
                {row.address ? (
                  <span className="truncate">
                    {row.label ? (
                      <>
                        <span className="text-neutral-900">{row.label}</span>
                        <span className="text-neutral-400 font-mono ml-2">
                          {truncateAddress(row.address, 6, 4)}
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-neutral-900">
                        {truncateAddress(row.address, 10, 6)}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-neutral-400">Select address...</span>
                )}
                <Icon icon="solar:alt-arrow-down-linear" width={14} className="text-neutral-400 shrink-0 ml-2" />
              </div>

              {openDropdown === index && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-48 overflow-auto">
                  <div className="sticky top-0 bg-white p-2 border-b border-neutral-100">
                    <input
                      type="text"
                      autoFocus
                      value={searchTerms[index] ?? ""}
                      onChange={(e) => setSearchTerms((prev) => ({ ...prev, [index]: e.target.value }))}
                      placeholder="Search by label..."
                      className="w-full px-2 py-1.5 rounded border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                  </div>
                  {getFilteredEntries(index).length === 0 ? (
                    <p className="px-3 py-2 text-xs text-neutral-400">No matching addresses</p>
                  ) : (
                    getFilteredEntries(index).map((entry) => (
                      <button
                        key={entry.holder_address}
                        onClick={() => selectFromBook(index, entry)}
                        className="w-full text-left px-3 py-2 hover:bg-orange-50 text-sm transition-colors cursor-pointer"
                      >
                        <p className="text-neutral-900">{entry.label || "Unlabeled"}</p>
                        <p className="text-xs font-mono text-neutral-400">
                          {truncateAddress(entry.holder_address, 10, 6)}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <input
              type="number"
              min="1"
              max={balance !== null ? Number(balance) : undefined}
              value={row.amount}
              onChange={(e) => updateRow(index, "amount", e.target.value)}
              placeholder="Amount"
              className="w-32 px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              disabled={distributing}
            />
            <button
              onClick={() => removeRow(index)}
              disabled={rows.length <= 1 || distributing}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-red-100 text-neutral-400 hover:text-red-500 disabled:opacity-30 transition-colors cursor-pointer"
            >
              <Icon icon="solar:minus-circle-linear" width={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={addRow}
          disabled={distributing}
          className="text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 cursor-pointer"
        >
          <Icon icon="solar:add-circle-linear" width={16} />
          Add Row
        </button>
        {totalDistributing > 0n && (
          <p className={`text-xs ${overBudget ? "text-red-500 font-medium" : "text-neutral-500"}`}>
            Total: {Number(totalDistributing).toLocaleString()}
            {overBudget && " (exceeds balance)"}
          </p>
        )}
      </div>

      {distributing && progress.total > 0 && (
        <div className="space-y-1">
          <ProgressBar
            progress={(progress.completed / progress.total) * 100}
            complete={progress.completed === progress.total}
          />
          <p className="text-xs text-neutral-500 text-center">
            {progress.completed}/{progress.total} distributions complete
          </p>
        </div>
      )}

      <button
        onClick={handleDistribute}
        disabled={distributing || validCount === 0 || overBudget}
        className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-neutral-300 text-white text-sm font-medium transition-colors cursor-pointer flex items-center justify-center gap-2"
      >
        {distributing ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Distributing...
          </>
        ) : (
          `Distribute All (${validCount})`
        )}
      </button>
    </div>
  );
}
