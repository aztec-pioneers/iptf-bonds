"use client";

import { useCallback, useRef } from "react";
import { useAztecWallet } from "@/hooks/useAztecWallet";
import { STABLECOIN_ADDRESS, STABLECOIN_MINTER } from "@/config/contracts";

export function useTokenContract() {
  const { wallet, address } = useAztecWallet();
  const initialized = useRef(false);

  const ensureInitialized = useCallback(async () => {
    if (!wallet) throw new Error("Wallet not connected");
    if (initialized.current) return;

    if (!STABLECOIN_ADDRESS) throw new Error("NEXT_PUBLIC_STABLECOIN_ADDRESS not configured");

    if (STABLECOIN_MINTER) {
      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const minterCreds = JSON.parse(STABLECOIN_MINTER);
      const existingAccounts = wallet.getAccountAddresses();
      const minterAddr = AztecAddress.fromString(minterCreds.address);
      if (!existingAccounts.some((a) => a.equals(minterAddr))) {
        await wallet.registerExternalAccount(minterCreds);
      }
    }

    initialized.current = true;
  }, [wallet]);

  const getBalance = useCallback(async (): Promise<bigint> => {
    if (!wallet || !address) throw new Error("Wallet not connected");
    if (!STABLECOIN_ADDRESS) throw new Error("NEXT_PUBLIC_STABLECOIN_ADDRESS not configured");

    await ensureInitialized();

    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { TokenContract } = await import("@iptf/contracts/artifacts");

    const token = await TokenContract.at(
      AztecAddress.fromString(STABLECOIN_ADDRESS),
      wallet
    );
    const owner = AztecAddress.fromString(address);
    const { result } = await token.methods
      .balance_of_private(owner)
      .simulate({ from: owner });
    return result as bigint;
  }, [wallet, address, ensureInitialized]);

  const mint = useCallback(
    async (amount: bigint): Promise<void> => {
      if (!wallet || !address) throw new Error("Wallet not connected");
      if (!STABLECOIN_ADDRESS) throw new Error("NEXT_PUBLIC_STABLECOIN_ADDRESS not configured");
      if (!STABLECOIN_MINTER) throw new Error("NEXT_PUBLIC_STABLECOIN_MINTER not configured");

      await ensureInitialized();

      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { TokenContract } = await import("@iptf/contracts/artifacts");

      const minterCreds = JSON.parse(STABLECOIN_MINTER);
      const minterAddr = AztecAddress.fromString(minterCreds.address);

      const token = await TokenContract.at(
        AztecAddress.fromString(STABLECOIN_ADDRESS),
        wallet
      );
      const recipient = AztecAddress.fromString(address);
      await token.methods
        .mint_to_private(recipient, amount)
        .send({ from: minterAddr });
    },
    [wallet, address, ensureInitialized]
  );

  return { getBalance, mint };
}
