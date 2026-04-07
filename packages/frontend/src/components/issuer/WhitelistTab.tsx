"use client";

import { useState, useEffect } from "react";
import { useBondContract } from "@/hooks/useBondContract";
import { useToast } from "@/hooks/useToast";
import { listWhitelist, type AddressBookEntry } from "@/lib/api";
import { truncateAddress } from "@/lib/bond-utils";

interface WhitelistTabProps {
  bondAddress: string;
  bondName: string;
}

export default function WhitelistTab({ bondAddress, bondName }: WhitelistTabProps) {
  const { whitelist, ban, checkWhitelist } = useBondContract();
  const { showToast } = useToast();

  const [addAddress, setAddAddress] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [banningAddr, setBanningAddr] = useState<string | null>(null);
  const [verifyingAddr, setVerifyingAddr] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, boolean>>({});
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);

  const refreshEntries = () => {
    listWhitelist(bondAddress).then(setEntries).catch(console.error);
  };

  useEffect(() => {
    refreshEntries();
  }, [bondAddress]);

  const handleAdd = async () => {
    if (!addAddress) return;
    setAdding(true);
    try {
      await whitelist(bondAddress, addAddress, { label: label || undefined, bondName });
      showToast("Address whitelisted", "success");
      setAddAddress("");
      setLabel("");
      refreshEntries();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to whitelist", "error");
    } finally {
      setAdding(false);
    }
  };

  const handleVerify = async (addr: string) => {
    setVerifyingAddr(addr);
    try {
      const result = await checkWhitelist(bondAddress, addr);
      setVerifyResults((prev) => ({ ...prev, [addr]: result }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to verify", "error");
    } finally {
      setVerifyingAddr(null);
    }
  };

  const handleBan = async (addr: string) => {
    setBanningAddr(addr);
    try {
      await ban(bondAddress, addr);
      showToast("Address banned", "success");
      refreshEntries();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to ban", "error");
    } finally {
      setBanningAddr(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Add to Whitelist */}
      <div>
        <h3 className="text-sm font-medium text-neutral-700 mb-2">Add to Whitelist</h3>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={addAddress}
            onChange={(e) => setAddAddress(e.target.value)}
            placeholder="Aztec address (0x...)"
            className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !addAddress}
            className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-neutral-300 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            {adding ? "Adding..." : "Whitelist"}
          </button>
        </div>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional, e.g. &quot;Fund A&quot;)"
          className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
        />
      </div>

      {/* Whitelisted Addresses */}
      {entries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-2">Whitelisted Addresses</h3>
          <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100">
            {entries.map((entry) => (
              <div key={entry.holder_address} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-mono text-neutral-900 truncate">
                    {truncateAddress(entry.holder_address, 10, 6)}
                  </p>
                  {entry.label && (
                    <p className="text-xs text-neutral-500">{entry.label}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <p className="text-xs text-neutral-400">
                    {new Date(entry.created_at + "Z").toLocaleDateString()}
                  </p>
                  <button
                    onClick={() => handleVerify(entry.holder_address)}
                    disabled={verifyingAddr === entry.holder_address}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer disabled:opacity-50 ${
                      verifyResults[entry.holder_address] === true
                        ? "text-green-600 border-green-200 bg-green-50"
                        : verifyResults[entry.holder_address] === false
                          ? "text-red-600 border-red-200 bg-red-50"
                          : "text-neutral-600 border-neutral-200 hover:bg-neutral-50"
                    }`}
                  >
                    {verifyingAddr === entry.holder_address
                      ? "Verifying..."
                      : verifyResults[entry.holder_address] === true
                        ? "Verified"
                        : verifyResults[entry.holder_address] === false
                          ? "Not Found"
                          : "Verify Onchain"}
                  </button>
                  <button
                    onClick={() => handleBan(entry.holder_address)}
                    disabled={banningAddr === entry.holder_address}
                    className="px-3 py-1 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {banningAddr === entry.holder_address ? "Banning..." : "Ban"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
