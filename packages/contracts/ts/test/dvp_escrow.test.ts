import { before, describe, test } from "node:test";
import { expect } from "@jest/globals";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import { createAztecNodeClient, type AztecNode } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import {
    DvPEscrowContract,
    DvPEscrowContractArtifact,
    PrivateBondsContract,
    PrivateBondsContractArtifact,
    TokenContract,
    TokenContractArtifact,
} from "../src/artifacts/index.js";
import { TOKEN_METADATA } from "../src/constants.js";
import {
    deployBondContract,
    deployTokenContract,
    deployDvPEscrow,
    whitelistInvestor,
    distributeBonds,
    lockDelivery,
    settle,
    getDvPConfig,
    expectBondBalancePrivate,
    expectTokenBalancePrivate,
    getBondContract,
    getTokenContract,
    getEscrowContract,
} from "../src/contract.js";
import { precision } from "../src/utils.js";
import type { ContractInstanceWithAddress } from "@aztec/stdlib/contract";

const { AZTEC_NODE_URL = "http://localhost:8080" } = process.env;

describe("DvP Escrow", () => {

    let node: AztecNode;

    let issuerWallet: EmbeddedWallet;
    let sellerWallet: EmbeddedWallet;
    let buyerWallet: EmbeddedWallet;

    let issuerAddress: AztecAddress;
    let sellerAddress: AztecAddress;
    let buyerAddress: AztecAddress;

    let bonds: PrivateBondsContract;
    let stablecoin: TokenContract;
    let escrow: DvPEscrowContract;

    let bondsInstance: ContractInstanceWithAddress;
    let stablecoinInstance: ContractInstanceWithAddress;
    let escrowInstance: ContractInstanceWithAddress;
    let escrowSecretKey: Fr;

    const BOND_SUPPLY = 1_000_000n;
    const BOND_AMOUNT = 100_000n; // bonds being sold in the DvP
    const PAYMENT_AMOUNT = precision(500n, 6n); // stablecoins paid for bonds
    const SELLER_BOND_INITIAL = 500_000n;
    const BUYER_STABLECOIN_INITIAL = precision(10_000n, 6n);

    before(async () => {
        // setup aztec node client
        node = createAztecNodeClient(AZTEC_NODE_URL);

        // setup wallets - issuer also acts as minter for stablecoins
        issuerWallet = await EmbeddedWallet.create(node, { ephemeral: true, pxeConfig: { proverEnabled: false } });
        sellerWallet = await EmbeddedWallet.create(node, { ephemeral: true, pxeConfig: { proverEnabled: false } });
        buyerWallet = await EmbeddedWallet.create(node, { ephemeral: true, pxeConfig: { proverEnabled: false } });
        const [issuerAccount, sellerAccount, buyerAccount] = await getInitialTestAccountsData();

        issuerAddress = (await issuerWallet.createSchnorrAccount(issuerAccount.secret, issuerAccount.salt, issuerAccount.signingKey)).address;
        sellerAddress = (await sellerWallet.createSchnorrAccount(sellerAccount.secret, sellerAccount.salt, sellerAccount.signingKey)).address;
        buyerAddress = (await buyerWallet.createSchnorrAccount(buyerAccount.secret, buyerAccount.salt, buyerAccount.signingKey)).address;

        // register senders across wallets
        await issuerWallet.registerSender(sellerAddress, "seller");
        await issuerWallet.registerSender(buyerAddress, "buyer");
        await sellerWallet.registerSender(issuerAddress, "issuer");
        await sellerWallet.registerSender(buyerAddress, "buyer");
        await buyerWallet.registerSender(issuerAddress, "issuer");
        await buyerWallet.registerSender(sellerAddress, "seller");

        // Deploy Token / stablecoin (buy side) — must deploy first since bonds need payment_token
        ({ contract: stablecoin, instance: stablecoinInstance } = await deployTokenContract(
            issuerWallet, issuerAddress, TOKEN_METADATA.stablecoin
        ));

        // Deploy PrivateBonds (sell side)
        ({ contract: bonds, instance: bondsInstance } = await deployBondContract(
            issuerWallet, issuerAddress, BOND_SUPPLY, 0n, stablecoin.address
        ));

        // Register contracts across wallets
        for (const wallet of [sellerWallet, buyerWallet]) {
            await wallet.registerContract(bondsInstance, PrivateBondsContractArtifact);
            await wallet.registerContract(stablecoinInstance, TokenContractArtifact);
        }

        // Issuer distributes bonds to seller
        await whitelistInvestor(issuerWallet, issuerAddress, bonds, sellerAddress);
        await distributeBonds(issuerWallet, issuerAddress, bonds, sellerAddress, SELLER_BOND_INITIAL);

        // Minter mints stablecoins to buyer
        await stablecoin
            .withWallet(issuerWallet)
            .methods.mint_to_private(buyerAddress, BUYER_STABLECOIN_INITIAL)
            .send({ from: issuerAddress });
    });

    test("deploy escrow and verify config", async () => {
        // Whitelist escrow contract address — it needs to hold bonds
        // We need to deploy escrow first to get its address, then whitelist it
        ({ contract: escrow, instance: escrowInstance, secretKey: escrowSecretKey } = await deployDvPEscrow(
            sellerWallet,
            sellerAddress,
            bonds.address,
            BOND_AMOUNT,
            stablecoin.address,
            PAYMENT_AMOUNT,
        ));

        // Whitelist the escrow contract address so it can hold bonds
        await whitelistInvestor(issuerWallet, issuerAddress, bonds, escrow.address);
        // Also whitelist buyer so they can receive bonds from escrow
        await whitelistInvestor(issuerWallet, issuerAddress, bonds, buyerAddress);

        // Verify config
        const config = await getDvPConfig(sellerWallet, escrow);
        expect(config.owner).toEqual(escrow.address);
        expect(config.bond_address).toEqual(bonds.address);
        expect(config.bond_amount).toEqual(BOND_AMOUNT);
        expect(config.payment_token_address).toEqual(stablecoin.address);
        expect(config.payment_amount).toEqual(PAYMENT_AMOUNT);
    });

    test("seller locks bond delivery", async () => {
        // Verify seller balance before
        expect(await expectBondBalancePrivate(sellerWallet, sellerAddress, bonds, SELLER_BOND_INITIAL)).toBe(true);

        // Seller locks bonds into escrow
        await lockDelivery(sellerWallet, sellerAddress, escrow, bonds, BOND_AMOUNT);

        // Verify balances after lock
        const expectedSellerBonds = SELLER_BOND_INITIAL - BOND_AMOUNT;
        expect(await expectBondBalancePrivate(sellerWallet, sellerAddress, bonds, expectedSellerBonds)).toBe(true);
    });

    test("buyer settles with stablecoins", async () => {
        // Register escrow in buyer wallet
        await getEscrowContract(buyerWallet, escrow.address, escrowInstance, escrowSecretKey);

        // Buyer settles — pays stablecoins, receives bonds
        await settle(buyerWallet, buyerAddress, escrow, stablecoin, PAYMENT_AMOUNT);

        // Verify final balances
        // Seller: started with 500k bonds, locked 100k → 400k bonds remaining, received PAYMENT_AMOUNT stablecoins
        const expectedSellerBonds = SELLER_BOND_INITIAL - BOND_AMOUNT;
        expect(await expectBondBalancePrivate(sellerWallet, sellerAddress, bonds, expectedSellerBonds)).toBe(true);
        expect(await expectTokenBalancePrivate(sellerWallet, sellerAddress, stablecoin, PAYMENT_AMOUNT)).toBe(true);

        // Buyer: received 100k bonds, paid PAYMENT_AMOUNT stablecoins
        expect(await expectBondBalancePrivate(buyerWallet, buyerAddress, bonds, BOND_AMOUNT)).toBe(true);
        const expectedBuyerStablecoins = BUYER_STABLECOIN_INITIAL - PAYMENT_AMOUNT;
        expect(await expectTokenBalancePrivate(buyerWallet, buyerAddress, stablecoin, expectedBuyerStablecoins)).toBe(true);
    });
});
