import "dotenv/config";
import { writeFileSync } from "node:fs";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { isTestnet } from "@iptf/contracts/utils";
import {
    deployDvPEscrow,
    lockDelivery,
    getBondContract,
    getTokenContract,
} from "@iptf/contracts/contract";
import {
    getTestnetSendWaitOptions,
    getIPTFAccounts,
    BOND_AMOUNT,
    PAYMENT_AMOUNT,
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

    const { wallet, sellerAddress } = await getIPTFAccounts(node, pxeConfig);
    const opts = await getTestnetSendWaitOptions(node, wallet, sellerAddress);

    // load contracts
    const bondsAddress = AztecAddress.fromString(bondsDeployment.address);
    const bondsInstance = await node.getContract(bondsAddress);
    if (!bondsInstance) throw new Error(`Bonds contract not found at ${bondsAddress}`);
    const bonds = await getBondContract(wallet, bondsAddress, bondsInstance);

    const stablecoinAddress = AztecAddress.fromString(stablecoinDeployment.address);
    const stablecoinInstance = await node.getContract(stablecoinAddress);
    if (!stablecoinInstance) throw new Error(`Stablecoin contract not found at ${stablecoinAddress}`);
    await getTokenContract(wallet, stablecoinAddress, stablecoinInstance);

    // deploy DvP escrow
    console.log("Deploying DvP escrow...");
    const { contract: escrow, instance: escrowInstance, secretKey } = await deployDvPEscrow(
        wallet,
        sellerAddress,
        bondsAddress,
        BOND_AMOUNT,
        stablecoinAddress,
        PAYMENT_AMOUNT,
        opts
    );
    console.log(`DvP Escrow deployed: ${escrow.address}`);

    // lock bond delivery
    console.log(`Locking ${BOND_AMOUNT} bonds into escrow...`);
    const lockOpts = { send: { ...opts.send, additionalScopes: [escrow.address] } };
    await lockDelivery(wallet, sellerAddress, escrow, bonds, BOND_AMOUNT, lockOpts);
    console.log("Bonds locked in escrow");

    // persist escrow state
    const escrowData = {
        address: escrow.address,
        secretKey: secretKey,
    };
    const filepath = `${__dirname}/data/escrow.json`;
    writeFileSync(filepath, JSON.stringify(escrowData, null, 2));
    console.log(`Escrow state written to ${filepath}`);

    console.log("\nEscrow config:");
    console.log(`  Bond address: ${bondsAddress}`);
    console.log(`  Bond amount: ${BOND_AMOUNT}`);
    console.log(`  Payment token: ${stablecoinAddress}`);
    console.log(`  Payment amount: ${PAYMENT_AMOUNT}`);
}

main().then(() => process.exit(0));
