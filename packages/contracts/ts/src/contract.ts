import { AztecAddress } from "@aztec/aztec.js/addresses";
import type {
    ContractInstanceWithAddress,
    InteractionWaitOptions,
    SendInteractionOptions,
    SimulateInteractionOptions,
} from "@aztec/aztec.js/contracts";
import { Fr } from "@aztec/aztec.js/fields";
import { TxHash } from "@aztec/aztec.js/tx";
import type { Wallet } from "@aztec/aztec.js/wallet";
import { AuthWitness } from "@aztec/stdlib/auth-witness";
import { deriveKeys } from "@aztec/stdlib/keys";
import {
    DvPEscrowContract,
    DvPEscrowContractArtifact,
    PrivateBondsContract,
    PrivateBondsContractArtifact,
    TokenContract,
    TokenContractArtifact,
} from "./artifacts/index.js";
import { type EscrowConfig } from "./constants.js";

// =============================================================================
// Bond Contract Helpers
// =============================================================================

/**
 * Deploy a PrivateBonds contract.
 * Uses private initializer — issuer gets the full supply minted to their private balance.
 */
export async function deployBondContract(
    wallet: Wallet,
    from: AztecAddress,
    totalSupply: bigint,
    maturity: bigint,
    paymentToken: AztecAddress,
    opts: { send: SendInteractionOptions<InteractionWaitOptions> } = { send: { from } }
): Promise<{ contract: PrivateBondsContract, instance: ContractInstanceWithAddress }> {
    const contractDeployment = await PrivateBondsContract.deployWithOpts(
        { wallet, method: "constructor" },
        totalSupply,
        maturity,
        paymentToken,
    );
    const instance = await contractDeployment.getInstance();
    const { contract } = await contractDeployment.send(opts.send);
    return { contract, instance };
}

/**
 * Whitelist an investor on the bond contract.
 */
export async function whitelistInvestor(
    wallet: Wallet,
    from: AztecAddress,
    bondContract: PrivateBondsContract,
    investor: AztecAddress,
    opts: { send: SendInteractionOptions<InteractionWaitOptions> } = { send: { from } }
): Promise<TxHash> {
    const { receipt } = await bondContract
        .withWallet(wallet)
        .methods
        .add_to_whitelist(investor)
        .send(opts.send);
    return receipt.txHash;
}

/**
 * Distribute bonds from issuer to an investor.
 */
export async function distributeBonds(
    wallet: Wallet,
    from: AztecAddress,
    bondContract: PrivateBondsContract,
    investor: AztecAddress,
    amount: bigint,
    opts: { send: SendInteractionOptions<InteractionWaitOptions> } = { send: { from } }
): Promise<TxHash> {
    const { receipt } = await bondContract
        .withWallet(wallet)
        .methods
        .distribute_private(investor, amount)
        .send(opts.send);
    return receipt.txHash;
}

// =============================================================================
// Token (Stablecoin) Helpers
// =============================================================================

/**
 * Deploy an aztec-standards Token contract (used as stablecoin / payment token).
 */
export async function deployTokenContract(
    wallet: Wallet,
    from: AztecAddress,
    tokenMetadata: { name: string; symbol: string; decimals: number },
    opts: { send: SendInteractionOptions<InteractionWaitOptions> } = { send: { from } }
): Promise<{ contract: TokenContract, instance: ContractInstanceWithAddress }> {
    const contractDeployment = await TokenContract.deployWithOpts(
        { wallet, method: "constructor_with_minter" },
        tokenMetadata.name,
        tokenMetadata.symbol,
        tokenMetadata.decimals,
        from,
    );
    const instance = await contractDeployment.getInstance();
    const { contract } = await contractDeployment.send(opts.send);
    return { contract, instance };
}

// =============================================================================
// DvP Escrow Helpers
// =============================================================================

/**
 * Deploy a DvP Escrow contract.
 * The escrow needs its own encryption keys for private state (config note).
 */
export async function deployDvPEscrow(
    wallet: Wallet,
    from: AztecAddress,
    bondAddress: AztecAddress,
    bondAmount: bigint,
    paymentTokenAddress: AztecAddress,
    paymentAmount: bigint,
    opts: { send: SendInteractionOptions<InteractionWaitOptions> } = { send: { from } }
): Promise<{ contract: DvPEscrowContract, instance: ContractInstanceWithAddress, secretKey: Fr }> {
    const secretKey = Fr.random();
    const contractPublicKeys = (await deriveKeys(secretKey)).publicKeys;
    const contractDeployment = await DvPEscrowContract.deployWithPublicKeys(
        contractPublicKeys,
        wallet,
        bondAddress,
        bondAmount,
        paymentTokenAddress,
        paymentAmount,
    );
    const instance = await contractDeployment.getInstance();
    await wallet.registerContract(instance, DvPEscrowContractArtifact, secretKey);
    opts.send = { additionalScopes: [instance.address], ...opts.send };
    const { contract } = await contractDeployment.send(opts.send);
    return { contract, instance, secretKey };
}

/**
 * Seller locks bond delivery into escrow.
 * Creates authwit for PrivateBonds::transfer_from, then calls lock_delivery.
 */
export async function lockDelivery(
    wallet: Wallet,
    from: AztecAddress,
    escrow: DvPEscrowContract,
    bondContract: PrivateBondsContract,
    amount: bigint,
    opts: { send: SendInteractionOptions<InteractionWaitOptions> } = { send: { from, additionalScopes: [escrow.address] } }
): Promise<TxHash> {
    escrow = escrow.withWallet(wallet);
    const { nonce, authwit } = await getBondTransferAuthwit(
        wallet,
        from,
        bondContract,
        escrow.address,
        escrow.address,
        amount,
    );
    const { receipt } = await escrow
        .methods
        .lock_delivery(nonce)
        .with({ authWitnesses: [authwit] })
        .send(opts.send);
    return receipt.txHash;
}

/**
 * Buyer settles the escrow by paying stablecoins and receiving bonds.
 * Creates authwit for Token::transfer_private_to_private, then calls settle.
 */
export async function settle(
    wallet: Wallet,
    from: AztecAddress,
    escrow: DvPEscrowContract,
    paymentToken: TokenContract,
    amount: bigint,
    opts: { send: SendInteractionOptions<InteractionWaitOptions> } = { send: { from, additionalScopes: [escrow.address] } }
): Promise<TxHash> {
    escrow = escrow.withWallet(wallet);
    const { nonce, authwit } = await getPaymentTransferAuthwit(
        wallet,
        from,
        paymentToken,
        escrow.address,
        escrow.address,
        amount,
    );
    const { receipt } = await escrow
        .methods
        .settle(nonce)
        .with({ authWitnesses: [authwit] })
        .send(opts.send);
    return receipt.txHash;
}

// =============================================================================
// Authwit Helpers
// =============================================================================

/**
 * Create authwit for PrivateBonds::transfer_from (sell side / bond transfers).
 */
export async function getBondTransferAuthwit(
    wallet: Wallet,
    from: AztecAddress,
    bondContract: PrivateBondsContract,
    caller: AztecAddress,
    to: AztecAddress,
    amount: bigint,
): Promise<{ authwit: AuthWitness, nonce: Fr }> {
    const nonce = Fr.random();
    const call = await bondContract.withWallet(wallet).methods.transfer_from(
        from,
        to,
        amount,
        nonce,
    ).getFunctionCall();
    const authwit = await wallet.createAuthWit(from, { caller, call });
    return { authwit, nonce };
}

/**
 * Create authwit for Token::transfer_private_to_private (buy side / payment transfers).
 */
export async function getPaymentTransferAuthwit(
    wallet: Wallet,
    from: AztecAddress,
    token: TokenContract,
    caller: AztecAddress,
    to: AztecAddress,
    amount: bigint,
): Promise<{ authwit: AuthWitness, nonce: Fr }> {
    const nonce = Fr.random();
    const call = await token.withWallet(wallet).methods.transfer_private_to_private(
        from,
        to,
        amount,
        nonce,
    ).getFunctionCall();
    const authwit = await wallet.createAuthWit(from, { caller, call });
    return { authwit, nonce };
}

// =============================================================================
// Config + Balance Helpers
// =============================================================================

/**
 * Get the escrow config note.
 */
export async function getDvPConfig(
    wallet: Wallet,
    escrow: DvPEscrowContract,
): Promise<EscrowConfig> {
    const { result } = await escrow
        .withWallet(wallet)
        .methods
        .get_config()
        .simulate({ from: escrow.address });
    return result;
}

/**
 * Check private balance of a Token contract.
 */
export async function expectTokenBalancePrivate(
    wallet: Wallet,
    from: AztecAddress,
    token: TokenContract,
    expectedBalance: bigint,
    opts: SimulateInteractionOptions = { from }
): Promise<boolean> {
    const { result: balance } = await token
        .withWallet(wallet)
        .methods
        .balance_of_private(from)
        .simulate(opts);
    return balance === expectedBalance;
}

/**
 * Check private balance of a PrivateBonds contract.
 */
export async function expectBondBalancePrivate(
    wallet: Wallet,
    from: AztecAddress,
    bondContract: PrivateBondsContract,
    expectedBalance: bigint,
    opts: SimulateInteractionOptions = { from }
): Promise<boolean> {
    const { result: balance } = await bondContract
        .withWallet(wallet)
        .methods
        .private_balance_of(from)
        .simulate(opts);
    return balance === expectedBalance;
}

// =============================================================================
// Contract Registration Helpers
// =============================================================================

export const getTokenContract = async (
    wallet: Wallet,
    tokenAddress: AztecAddress,
    instance: ContractInstanceWithAddress,
): Promise<TokenContract> => {
    await wallet.registerContract(instance, TokenContractArtifact);
    return await TokenContract.at(tokenAddress, wallet);
};

export const getBondContract = async (
    wallet: Wallet,
    bondAddress: AztecAddress,
    instance: ContractInstanceWithAddress,
): Promise<PrivateBondsContract> => {
    await wallet.registerContract(instance, PrivateBondsContractArtifact);
    return await PrivateBondsContract.at(bondAddress, wallet);
};

export const getEscrowContract = async (
    wallet: Wallet,
    escrowAddress: AztecAddress,
    instance: ContractInstanceWithAddress,
    escrowSecretKey: Fr,
): Promise<DvPEscrowContract> => {
    await wallet.registerContract(instance, DvPEscrowContractArtifact, escrowSecretKey);
    await wallet.registerSender(escrowAddress);
    return await DvPEscrowContract.at(escrowAddress, wallet);
};
