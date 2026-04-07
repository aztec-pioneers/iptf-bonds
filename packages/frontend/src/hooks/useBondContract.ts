"use client";

import { useCallback } from "react";
import { useAztecWallet } from "@/hooks/useAztecWallet";
import { useToast } from "@/hooks/useToast";
import { createIssuedBond, addToWhitelist, removeFromWhitelist } from "@/lib/api";
import { decodeNameFromField } from "@/lib/bond-utils";
import { STABLECOIN_ADDRESS } from "@/config/contracts";

export function useBondContract() {
  const { wallet, address } = useAztecWallet();
  const { showToast } = useToast();

  const deployBond = useCallback(
    async (name: string, totalSupply: bigint, maturityDate: bigint) => {
      if (!wallet || !address) throw new Error("Wallet not connected");

      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { deployBondContract } = await import("@iptf/contracts/contract");

      if (!STABLECOIN_ADDRESS) throw new Error("NEXT_PUBLIC_STABLECOIN_ADDRESS not configured");
      const paymentToken = AztecAddress.fromString(STABLECOIN_ADDRESS);

      const from = AztecAddress.fromString(address);
      const { contract } = await wallet.enqueue(() =>
        deployBondContract(
          wallet,
          from,
          name,
          totalSupply,
          maturityDate,
          paymentToken
        )
      );

      const blockNumber = await wallet.getNode().getBlockNumber();

      await createIssuedBond({
        contractAddress: contract.address.toString(),
        issuerAddress: address,
        name,
        totalSupply: totalSupply.toString(),
        maturityDate: maturityDate.toString(),
        deployedBlock: blockNumber,
      });

      return contract.address.toString();
    },
    [wallet, address]
  );

  const whitelist = useCallback(
    async (bondAddress: string, investor: string, opts: { label?: string; bondName: string }) => {
      if (!wallet || !address) throw new Error("Wallet not connected");

      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { PrivateBondsContract } = await import("@iptf/contracts/artifacts");

      const bond = await PrivateBondsContract.at(
        AztecAddress.fromString(bondAddress),
        wallet
      );
      await wallet.enqueue(() =>
        bond.methods
          .add_to_whitelist(AztecAddress.fromString(investor))
          .send({ from: AztecAddress.fromString(address) })
      );

      await addToWhitelist({
        bondAddress,
        holderAddress: investor,
        label: opts.label,
        issuerAddress: address,
        bondName: opts.bondName,
      });
    },
    [wallet, address]
  );

  const ban = useCallback(
    async (bondAddress: string, investor: string) => {
      if (!wallet || !address) throw new Error("Wallet not connected");

      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { PrivateBondsContract } = await import("@iptf/contracts/artifacts");

      const bond = await PrivateBondsContract.at(
        AztecAddress.fromString(bondAddress),
        wallet
      );
      await wallet.enqueue(() =>
        bond.methods
          .ban_from_whitelist(AztecAddress.fromString(investor))
          .send({ from: AztecAddress.fromString(address) })
      );

      await removeFromWhitelist(bondAddress, investor);
    },
    [wallet, address]
  );

  const distribute = useCallback(
    async (bondAddress: string, investor: string, amount: bigint) => {
      if (!wallet || !address) throw new Error("Wallet not connected");

      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { PrivateBondsContract } = await import("@iptf/contracts/artifacts");

      const bond = await PrivateBondsContract.at(
        AztecAddress.fromString(bondAddress),
        wallet
      );
      await wallet.enqueue(() =>
        bond.methods
          .distribute_private(AztecAddress.fromString(investor), amount)
          .send({ from: AztecAddress.fromString(address) })
      );
    },
    [wallet, address]
  );

  const batchDistribute = useCallback(
    async (
      bondAddress: string,
      distributions: { address: string; amount: bigint }[],
      onProgress?: (completed: number, total: number) => void
    ) => {
      if (!wallet || !address) throw new Error("Wallet not connected");

      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { PrivateBondsContract } = await import("@iptf/contracts/artifacts");
      const { BatchCall } = await import("@aztec/aztec.js/contracts");

      const bond = await PrivateBondsContract.at(
        AztecAddress.fromString(bondAddress),
        wallet
      );
      const from = AztecAddress.fromString(address);

      const total = distributions.length;
      let completed = 0;

      // Process in batches of 4
      for (let i = 0; i < distributions.length; i += 4) {
        const batch = distributions.slice(i, i + 4);

        await wallet.enqueue(async () => {
          const calls = batch.map((d) =>
            bond.methods
              .distribute_private(AztecAddress.fromString(d.address), d.amount)
              .request({ from })
          );

          const resolvedCalls = await Promise.all(calls);
          const batchCall = new BatchCall(wallet, resolvedCalls);
          await batchCall.send({ from });
        });

        completed += batch.length;
        onProgress?.(completed, total);
      }
    },
    [wallet, address]
  );

  const getBalance = useCallback(
    async (bondAddress: string, owner?: string) => {
      if (!wallet || !address) throw new Error("Wallet not connected");

      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { PrivateBondsContract } = await import("@iptf/contracts/artifacts");

      const bond = await PrivateBondsContract.at(
        AztecAddress.fromString(bondAddress),
        wallet
      );
      const target = AztecAddress.fromString(owner ?? address);
      return wallet.enqueue(async () => {
        const { result } = await bond.methods
          .private_balance_of(target)
          .simulate({ from: target });
        return result as bigint;
      });
    },
    [wallet, address]
  );

  const getBondInfo = useCallback(
    async (bondAddress: string) => {
      if (!wallet || !address) throw new Error("Wallet not connected");

      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { PrivateBondsContract } = await import("@iptf/contracts/artifacts");

      const bond = await PrivateBondsContract.at(
        AztecAddress.fromString(bondAddress),
        wallet
      );
      const from = AztecAddress.fromString(address);

      const result = await wallet.enqueue(async () => {
        const nameResult = await bond.methods.get_name().simulate({ from });
        const supplyResult = await bond.methods.get_total_supply().simulate({ from });
        const maturityResult = await bond.methods.get_maturity_date().simulate({ from });
        return {
          name: decodeNameFromField(nameResult.result as bigint),
          totalSupply: supplyResult.result as bigint,
          maturityDate: maturityResult.result as bigint,
        };
      });

      return result;
    },
    [wallet, address]
  );

  const checkWhitelist = useCallback(
    async (bondAddress: string, addr: string) => {
      if (!wallet || !address) throw new Error("Wallet not connected");

      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { PrivateBondsContract } = await import("@iptf/contracts/artifacts");

      const bond = await PrivateBondsContract.at(
        AztecAddress.fromString(bondAddress),
        wallet
      );
      return wallet.enqueue(async () => {
        const { result } = await bond.methods
          .is_whitelisted(AztecAddress.fromString(addr))
          .simulate({ from: AztecAddress.fromString(address) });
        return result as boolean;
      });
    },
    [wallet, address]
  );

  const redeem = useCallback(
    async (bondAddress: string, amount: bigint) => {
      if (!wallet || !address) throw new Error("Wallet not connected");

      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { PrivateBondsContract } = await import("@iptf/contracts/artifacts");

      const bond = await PrivateBondsContract.at(
        AztecAddress.fromString(bondAddress),
        wallet
      );
      await wallet.enqueue(() =>
        bond.methods
          .redeem(amount)
          .send({ from: AztecAddress.fromString(address) })
      );
    },
    [wallet, address]
  );

  const registerBond = useCallback(
    async (contractAddress: string, issuerAddress: string) => {
      if (!wallet) throw new Error("Wallet not connected");

      const { AztecAddress } = await import("@aztec/aztec.js/addresses");

      await wallet.registerBondContract(AztecAddress.fromString(contractAddress));
      await wallet.enqueue(() => wallet.registerSender(AztecAddress.fromString(issuerAddress)));
    },
    [wallet]
  );

  const getBlockTimestamp = useCallback(async () => {
    if (!wallet) throw new Error("Wallet not connected");

    const node = wallet.getNode();
    const blockNumber = await node.getBlockNumber();
    const block = await node.getBlock(blockNumber);
    return block ? BigInt(block.header.globalVariables.timestamp) : 0n;
  }, [wallet]);

  const getPublicUsdcBalance = useCallback(
    async (bondAddress: string) => {
      if (!wallet || !address) throw new Error("Wallet not connected");

      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { TokenContract } = await import("@iptf/contracts/artifacts");

      if (!STABLECOIN_ADDRESS) throw new Error("NEXT_PUBLIC_STABLECOIN_ADDRESS not configured");
      const token = await TokenContract.at(
        AztecAddress.fromString(STABLECOIN_ADDRESS),
        wallet
      );
      const from = AztecAddress.fromString(address);
      return wallet.enqueue(async () => {
        const { result } = await token.methods
          .balance_of_public(AztecAddress.fromString(bondAddress))
          .simulate({ from });
        return result as bigint;
      });
    },
    [wallet, address]
  );

  const depositUsdc = useCallback(
    async (bondAddress: string, amount: bigint) => {
      if (!wallet || !address) throw new Error("Wallet not connected");

      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { TokenContract } = await import("@iptf/contracts/artifacts");

      if (!STABLECOIN_ADDRESS) throw new Error("NEXT_PUBLIC_STABLECOIN_ADDRESS not configured");
      const token = await TokenContract.at(
        AztecAddress.fromString(STABLECOIN_ADDRESS),
        wallet
      );
      const from = AztecAddress.fromString(address);
      await wallet.enqueue(() =>
        token.methods
          .transfer_private_to_public(from, AztecAddress.fromString(bondAddress), amount, 0n)
          .send({ from })
      );
    },
    [wallet, address]
  );

  return {
    deployBond,
    whitelist,
    ban,
    distribute,
    batchDistribute,
    getBalance,
    getBondInfo,
    checkWhitelist,
    redeem,
    registerBond,
    getBlockTimestamp,
    getPublicUsdcBalance,
    depositUsdc,
  };
}
