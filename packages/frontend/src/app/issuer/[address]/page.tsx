"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import RequireWallet from "@/components/layout/RequireWallet";
import TabBar from "@/components/ui/TabBar";
import WhitelistTab from "@/components/issuer/WhitelistTab";
import DistributeTab from "@/components/issuer/DistributeTab";
import HoldersTab from "@/components/issuer/HoldersTab";
import TransfersTab from "@/components/issuer/TransfersTab";
import SwapsTab from "@/components/issuer/SwapsTab";
import BondRepaymentTab from "@/components/issuer/BondRepaymentTab";
import { useBondContract } from "@/hooks/useBondContract";
import { useBondEvents } from "@/hooks/useBondEvents";
import { useAztecWallet } from "@/hooks/useAztecWallet";
import { getIssuedBond, listWhitelist, listEscrowOrders } from "@/lib/api";
import { truncateAddress } from "@/lib/bond-utils";

const TABS = [
  { key: "whitelist", label: "Whitelist" },
  { key: "distribute", label: "Distribute" },
  { key: "holders", label: "Holders" },
  { key: "transfers", label: "Transfers" },
  { key: "swaps", label: "Swaps" },
  { key: "repayment", label: "Bond Repayment" },
];

export default function ManageBondPage() {
  const params = useParams();
  const bondAddress = params.address as string;
  const { wallet } = useAztecWallet();
  const { getBondInfo } = useBondContract();
  const bondEvents = useBondEvents();

  const [activeTab, setActiveTab] = useState("whitelist");
  const [bondName, setBondName] = useState<string | null>(null);
  const [deployedBlock, setDeployedBlock] = useState<number | undefined>();
  const [addressLabels, setAddressLabels] = useState<Map<string, string>>(new Map());
  const [escrowAddresses, setEscrowAddresses] = useState<Set<string>>(new Set());
  const [labelsLoaded, setLabelsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bondAddress || !wallet) return;

    // Ensure bond contract is registered in PXE before any interactions
    const init = import("@aztec/aztec.js/addresses").then(({ AztecAddress }) =>
      wallet.registerBondContract(AztecAddress.fromString(bondAddress))
    ).catch(() => {});

    // Fetch on-chain info, DB metadata, whitelist, and escrow orders in parallel
    init.then(() => Promise.all([
      getBondInfo(bondAddress).catch(() => null),
      getIssuedBond(bondAddress).catch(() => null),
      listWhitelist(bondAddress).catch(() => []),
      listEscrowOrders(bondAddress, { status: "all" }).catch(() => []),
    ])).then(([info, dbRow, whitelist, escrows]) => {
      setBondName(info?.name || "Unnamed Bond");
      if (dbRow?.deployed_block) setDeployedBlock(dbRow.deployed_block);

      const labels = new Map<string, string>();
      for (const entry of whitelist) {
        labels.set(entry.holder_address, entry.label || truncateAddress(entry.holder_address, 6, 4));
      }
      setAddressLabels(labels);
      setEscrowAddresses(new Set(escrows.map((e) => e.escrow_address)));
      setLabelsLoaded(true);

      setLoading(false);
    });
  }, [bondAddress, wallet, getBondInfo]);

  // Fetch events when switching to holders or transfers tab
  useEffect(() => {
    if ((activeTab === "holders" || activeTab === "transfers") && bondEvents.events.length === 0 && !bondEvents.loading) {
      bondEvents.fetchEvents(bondAddress, deployedBlock);
    }
  }, [activeTab, bondAddress, deployedBlock]);

  return (
    <RequireWallet>
      <main className="flex-grow max-w-4xl mx-auto w-full px-6 py-10 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            {loading ? "Loading..." : bondName}
          </h1>
          <p className="text-xs font-mono text-neutral-400 mt-1">
            {truncateAddress(bondAddress, 10, 8)}
          </p>
        </div>

        {/* Tabs */}
        <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {/* Tab content */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          {activeTab === "whitelist" && <WhitelistTab bondAddress={bondAddress} bondName={bondName ?? "Bond"} />}
          {activeTab === "distribute" && <DistributeTab bondAddress={bondAddress} />}
          {activeTab === "holders" && (
            <HoldersTab
              holderBalances={bondEvents.holderBalances}
              loading={bondEvents.loading}
              onRefresh={() => bondEvents.fetchEvents(bondAddress, deployedBlock)}
              addressLabels={addressLabels}
              labelsLoaded={labelsLoaded}
            />
          )}
          {activeTab === "transfers" && (
            <TransfersTab
              events={bondEvents.events}
              loading={bondEvents.loading}
              onRefresh={() => bondEvents.fetchEvents(bondAddress, deployedBlock)}
              addressLabels={addressLabels}
              escrowAddresses={escrowAddresses}
              labelsLoaded={labelsLoaded}
            />
          )}
          {activeTab === "swaps" && <SwapsTab bondAddress={bondAddress} />}
          {activeTab === "repayment" && <BondRepaymentTab bondAddress={bondAddress} />}
        </div>
      </main>
    </RequireWallet>
  );
}
