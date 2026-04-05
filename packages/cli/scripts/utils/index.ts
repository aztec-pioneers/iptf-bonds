import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { isTestnet, wad } from "@iptf/contracts/utils";
import { getPriorityFeeOptions, getSponsoredPaymentMethod } from "@iptf/contracts/fees";
import type { SendInteractionOptions, WaitOpts } from "@aztec/aztec.js/contracts";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { AztecNode } from "@aztec/aztec.js/node";
import { Fr } from "@aztec/aztec.js/fields";
import type { PXEConfig } from "@aztec/pxe/config";
import accounts from "../data/accounts.json";

// =============================================================================
// Constants
// =============================================================================

export const BOND_SUPPLY = 1_000_000n;
export const SELLER_BOND_INITIAL = 200_000n;
export const BOND_AMOUNT = 100_000n;
export const BUYER_STABLECOIN_INITIAL = wad(200_000n, 6n);
export const PAYMENT_AMOUNT = wad(100_000n, 6n);
export const MATURITY_SECONDS = BigInt(365 * 24 * 60 * 60); // 1 year from deploy time

export const testnetPriorityFee = 10n;
export const testnetTimeout = 3600;
export const testnetInterval = 3;

// =============================================================================
// Fee / Send Options
// =============================================================================

export const getTestnetSendWaitOptions = async (
    node: AztecNode,
    wallet: EmbeddedWallet,
    from: AztecAddress,
    withFPC: boolean = true,
): Promise<{
    send: SendInteractionOptions<WaitOpts>,
}> => {
    let send: SendInteractionOptions<WaitOpts> = { from };
    if (await isTestnet(node)) {
        let fee = await getPriorityFeeOptions(node, testnetPriorityFee);
        if (withFPC) {
            const { SPONSORED_FPC_ADDRESS } = process.env;
            if (!SPONSORED_FPC_ADDRESS) throw new Error("SPONSORED_FPC_ADDRESS is not defined");
            const paymentMethod = await getSponsoredPaymentMethod(node, wallet, AztecAddress.fromString(SPONSORED_FPC_ADDRESS));
            fee = { ...fee, paymentMethod };
        }
        send = { ...send, fee, wait: { timeout: testnetTimeout, interval: testnetInterval } };
    }
    return { send };
}

// =============================================================================
// Account Management
// =============================================================================

export const getIPTFAccounts = async (
    node: AztecNode,
    pxeConfig: Partial<PXEConfig> = {}
): Promise<{
    wallet: EmbeddedWallet,
    issuerAddress: AztecAddress,
    sellerAddress: AztecAddress,
    buyerAddress: AztecAddress,
}> => {
    let wallet = await EmbeddedWallet.create(node, { pxeConfig });
    let issuerAddress: AztecAddress;
    let sellerAddress: AztecAddress;
    let buyerAddress: AztecAddress;
    if (await isTestnet(node)) {
        issuerAddress = await getAccountFromFs("issuer", wallet);
        sellerAddress = await getAccountFromFs("seller", wallet);
        buyerAddress = await getAccountFromFs("buyer", wallet);
    } else {
        const [issuerAccount, sellerAccount, buyerAccount] = await getInitialTestAccountsData();
        if (!issuerAccount) throw new Error("Issuer account not found");
        if (!sellerAccount) throw new Error("Seller account not found");
        if (!buyerAccount) throw new Error("Buyer account not found");
        issuerAddress = (await wallet.createSchnorrAccount(issuerAccount.secret, issuerAccount.salt, issuerAccount.signingKey)).address;
        sellerAddress = (await wallet.createSchnorrAccount(sellerAccount.secret, sellerAccount.salt, sellerAccount.signingKey)).address;
        buyerAddress = (await wallet.createSchnorrAccount(buyerAccount.secret, buyerAccount.salt, buyerAccount.signingKey)).address;
    }
    await wallet.registerSender(issuerAddress, "issuer");
    await wallet.registerSender(sellerAddress, "seller");
    await wallet.registerSender(buyerAddress, "buyer");
    return { wallet, issuerAddress, sellerAddress, buyerAddress };
}

export const getAccountFromFs = async (
    accountType: "issuer" | "seller" | "buyer",
    wallet: EmbeddedWallet
): Promise<AztecAddress> => {
    const accountSecret = accounts[accountType];
    const secretKey = Fr.fromString(accountSecret.secretKey);
    const salt = Fr.fromString(accountSecret.salt);
    const manager = await wallet.createSchnorrAccount(secretKey, salt);
    return manager.address;
}
