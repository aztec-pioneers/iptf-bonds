"use client";

import { useEffect, useState } from "react";
import { listRegisteredBonds, type RegisteredBondRow } from "@/lib/api";
import { useAztecWallet } from "@/hooks/useAztecWallet";
import { useBondContract } from "@/hooks/useBondContract";
import BondCard from "./BondCard";

export interface RegisteredBond {
  contractAddress: string;
  issuerAddress: string;
  bondName: string;
  registeredAt: string;
}

export default function HoldingsList() {
  const { address } = useAztecWallet();
  const { registerBond } = useBondContract();
  const [bonds, setBonds] = useState<RegisteredBond[]>([]);

  useEffect(() => {
    if (!address) return;
    listRegisteredBonds(address)
      .then(async (rows: RegisteredBondRow[]) => {
        const mapped: RegisteredBond[] = rows.map((r) => ({
          contractAddress: r.bond_contract_address,
          issuerAddress: r.issuer_address,
          bondName: r.bond_name,
          registeredAt: r.registered_at,
        }));

        // Register each bond with PXE before rendering cards
        for (const bond of mapped) {
          try {
            await registerBond(bond.contractAddress, bond.issuerAddress);
          } catch {
            // Ignore — may already be registered
          }
        }

        setBonds(mapped);
      })
      .catch(console.error);
  }, [address, registerBond]);

  if (bonds.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-6 text-center">
        <p className="text-sm text-neutral-500">
          No bonds yet. Ask an issuer to whitelist your address to see bonds here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-neutral-900">My Bond Holdings</h2>
      <div className="grid gap-4">
        {bonds.map((bond) => (
          <BondCard key={bond.contractAddress} bond={bond} />
        ))}
      </div>
    </div>
  );
}
