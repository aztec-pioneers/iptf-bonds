import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { InteractionFeeOptions } from "@aztec/aztec.js/contracts";
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { GasSettings } from '@aztec/stdlib/gas';
import { SponsoredFPCContractArtifact } from '@aztec/noir-contracts.js/SponsoredFPC';

export async function getSponsoredPaymentMethod(node: AztecNode, wallet: Wallet, fpcAddress: AztecAddress) {
    const instance = await node.getContract(fpcAddress);
    if (!instance) throw new Error(`SponsoredFPC not found on-chain at ${fpcAddress}`);
    await wallet.registerContract(instance, SponsoredFPCContractArtifact);
    return new SponsoredFeePaymentMethod(fpcAddress);
}

export async function getPriorityFeeOptions(
    node: AztecNode,
    feeMultiplier: bigint
): Promise<InteractionFeeOptions> {
    const maxFeesPerGas = (await node.getCurrentMinFees()).mul(feeMultiplier);
    return { gasSettings: GasSettings.default({ maxFeesPerGas }) };
}
