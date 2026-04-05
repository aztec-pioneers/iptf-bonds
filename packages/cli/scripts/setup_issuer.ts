import "dotenv/config";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { isTestnet } from "@iptf/contracts/utils";
import {
    whitelistInvestor,
    distributeBonds,
    getBondContract,
    getTokenContract,
} from "@iptf/contracts/contract";
import {
    getTestnetSendWaitOptions,
    getIPTFAccounts,
    SELLER_BOND_INITIAL,
    BUYER_STABLECOIN_INITIAL,
} from "./utils";
import {
    bonds as bondsDeployment,
    stablecoin as stablecoinDeployment
} from "./data/deployments.json";

const { L2_NODE_URL } = process.env;
if (!L2_NODE_URL) throw new Error("L2_NODE_URL not set in env");

const main = async () => {
    const node = createAztecNodeClient(L2_NODE_URL);

    let pxeConfig = {};
    if (await isTestnet(node)) pxeConfig = { proverEnabled: true };

    const { wallet, issuerAddress, sellerAddress, buyerAddress } = await getIPTFAccounts(node, pxeConfig);
    const opts = await getTestnetSendWaitOptions(node, wallet, issuerAddress);

    // load bond contract
    const bondsAddress = AztecAddress.fromString(bondsDeployment.address);
    const bondsInstance = await node.getContract(bondsAddress);
    if (!bondsInstance) throw new Error(`Bonds contract not found at ${bondsAddress}`);
    const bonds = await getBondContract(wallet, bondsAddress, bondsInstance);

    // load stablecoin contract
    const stablecoinAddress = AztecAddress.fromString(stablecoinDeployment.address);
    const stablecoinInstance = await node.getContract(stablecoinAddress);
    if (!stablecoinInstance) throw new Error(`Stablecoin contract not found at ${stablecoinAddress}`);
    const stablecoin = await getTokenContract(wallet, stablecoinAddress, stablecoinInstance);

    // whitelist seller
    console.log("Whitelisting seller...");
    await whitelistInvestor(wallet, issuerAddress, bonds, sellerAddress, opts);
    console.log(`Seller ${sellerAddress} whitelisted`);

    // whitelist buyer
    console.log("Whitelisting buyer...");
    await whitelistInvestor(wallet, issuerAddress, bonds, buyerAddress, opts);
    console.log(`Buyer ${buyerAddress} whitelisted`);

    // distribute bonds to seller
    console.log(`Distributing ${SELLER_BOND_INITIAL} bonds to seller...`);
    await distributeBonds(wallet, issuerAddress, bonds, sellerAddress, SELLER_BOND_INITIAL, opts);
    console.log("Bonds distributed to seller");

    // mint stablecoins to buyer
    console.log(`Minting ${BUYER_STABLECOIN_INITIAL} stablecoins to buyer...`);
    await stablecoin
        .withWallet(wallet)
        .methods
        .mint_to_private(buyerAddress, BUYER_STABLECOIN_INITIAL)
        .send(opts.send);
    console.log("Stablecoins minted to buyer");

    console.log("Issuer setup complete!");
}

main().then(() => process.exit(0));
