"use client";

import { useCallback } from "react";
import { useAztecWallet } from "@/hooks/useAztecWallet";
import { createEscrowOrder, listEscrowOrders, markEscrowFilled, type EscrowOrderRow } from "@/lib/api";
import { STABLECOIN_ADDRESS } from "@/config/contracts";

export function useEscrowContract() {
  const { wallet, address } = useAztecWallet();

  const createSellOrder = useCallback(
    async (bondAddress: string, bondAmount: bigint, paymentAmount: bigint): Promise<string> => {
      if (!wallet || !address) throw new Error("Wallet not connected");
      if (!STABLECOIN_ADDRESS) throw new Error("NEXT_PUBLIC_STABLECOIN_ADDRESS not configured");

      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { PrivateBondsContract } = await import("@iptf/contracts/artifacts");
      const { deployDvPEscrow, lockDelivery, getDvPConfig } = await import("@iptf/contracts/contract");

      const from = AztecAddress.fromString(address);
      const bondAddr = AztecAddress.fromString(bondAddress);
      const paymentTokenAddr = AztecAddress.fromString(STABLECOIN_ADDRESS);

      console.log("[escrow] deploying DvP escrow...");
      const { contract: escrow, secretKey } = await deployDvPEscrow(
        wallet,
        from,
        bondAddr,
        bondAmount,
        paymentTokenAddr,
        paymentAmount,
      );
      console.log("[escrow] deployed at", escrow.address.toString());

      // Register escrow as sender so PXE can discover its config note for lockDelivery
      await wallet.registerSender(escrow.address);

      // Diagnostic: verify config note is readable before lockDelivery
      console.log("[escrow] reading config note...");
      const config = await getDvPConfig(wallet, escrow);
      console.log("[escrow] config note OK:", {
        owner: config.owner.toString(),
        bondAmount: config.bond_amount,
        paymentAmount: config.payment_amount,
      });

      const bondContract = await PrivateBondsContract.at(bondAddr, wallet);
      console.log("[escrow] calling lockDelivery...");
      await lockDelivery(wallet, from, escrow, bondContract, bondAmount);

      await createEscrowOrder({
        escrowAddress: escrow.address.toString(),
        bondContractAddress: bondAddress,
        sellerAddress: address,
        bondAmount: bondAmount.toString(),
        paymentAmount: paymentAmount.toString(),
        secretKey: secretKey.toString(),
      });

      return escrow.address.toString();
    },
    [wallet, address]
  );

  const fillOrder = useCallback(
    async (escrowAddress: string, secretKey: string, paymentAmount: bigint): Promise<void> => {
      if (!wallet || !address) throw new Error("Wallet not connected");
      if (!STABLECOIN_ADDRESS) throw new Error("NEXT_PUBLIC_STABLECOIN_ADDRESS not configured");

      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { Fr } = await import("@aztec/aztec.js/fields");
      const { TokenContract } = await import("@iptf/contracts/artifacts");
      const { getEscrowContract, settle } = await import("@iptf/contracts/contract");

      const from = AztecAddress.fromString(address);
      const escrowAddr = AztecAddress.fromString(escrowAddress);

      const instance = await wallet.getNode().getContract(escrowAddr);
      if (!instance) throw new Error("Escrow contract not found on-chain");

      const escrow = await getEscrowContract(wallet, escrowAddr, instance, Fr.fromString(secretKey));
      const token = await TokenContract.at(AztecAddress.fromString(STABLECOIN_ADDRESS), wallet);

      await settle(wallet, from, escrow, token, paymentAmount);
      await markEscrowFilled(escrowAddress);
    },
    [wallet, address]
  );

  const listOrders = useCallback(
    async (bondAddress: string): Promise<EscrowOrderRow[]> => {
      return listEscrowOrders(bondAddress);
    },
    []
  );

  const listMyOrders = useCallback(
    async (bondAddress: string): Promise<EscrowOrderRow[]> => {
      if (!address) throw new Error("Wallet not connected");
      return listEscrowOrders(bondAddress, { seller: address });
    },
    [address]
  );

  return { createSellOrder, fillOrder, listOrders, listMyOrders };
}
