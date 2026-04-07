"use client";

import { useCallback, useState } from "react";
import { useAztecWallet } from "@/hooks/useAztecWallet";
import { PrivateBondsContract } from "@iptf/contracts/artifacts";

export interface TransferEventData {
  from: string;
  to: string;
  amount: bigint;
}

export function useBondEvents() {
  const { wallet, address } = useAztecWallet();
  const [events, setEvents] = useState<TransferEventData[]>([]);
  const [holderBalances, setHolderBalances] = useState<Map<string, bigint>>(new Map());
  const [loading, setLoading] = useState(false);

  const fetchEvents = useCallback(
    async (bondAddress: string, fromBlock?: number) => {
      if (!wallet || !address) return;
      setLoading(true);

      try {
        const { AztecAddress } = await import("@aztec/aztec.js/addresses");

        const eventMetadata = PrivateBondsContract.events.TransferEvent;

        const contractAddr = AztecAddress.fromString(bondAddress);
        const scope = AztecAddress.fromString(address);

        const toBlock = (await wallet.getNode().getBlockNumber()) + 1;

        const rawEvents = await wallet.enqueue(() =>
          wallet.getPrivateEvents(
            eventMetadata,
            {
              contractAddress: contractAddr,
              scopes: [scope],
              fromBlock: fromBlock ?? 1,
              toBlock,
            }
          )
        );

        const parsed: TransferEventData[] = rawEvents.map((e: any) => {
          const evt = e.event;
          return {
            from: evt.from?.inner?.toString() ?? evt.from?.toString() ?? "0x0",
            to: evt.to?.inner?.toString() ?? evt.to?.toString() ?? "0x0",
            amount: BigInt(evt.amount?.toString() ?? "0"),
          };
        });

        // Compute holder balances from events
        const balances = new Map<string, bigint>();
        for (const evt of parsed) {
          balances.set(evt.to, (balances.get(evt.to) ?? 0n) + evt.amount);
          balances.set(evt.from, (balances.get(evt.from) ?? 0n) - evt.amount);
        }

        // Remove zero/negative balances
        for (const [key, val] of balances) {
          if (val <= 0n) balances.delete(key);
        }

        setEvents(parsed);
        setHolderBalances(balances);
      } catch (err) {
        console.error("Failed to fetch events:", err);
        setEvents([]);
        setHolderBalances(new Map());
      } finally {
        setLoading(false);
      }
    },
    [wallet, address]
  );

  return { events, holderBalances, loading, fetchEvents };
}
