import "dotenv/config";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import { isTestnet } from "@iptf/contracts/utils";
import {
    settle,
    getEscrowContract,
    getBondContract,
    getTokenContract,
} from "@iptf/contracts/contract";
import {
    getTestnetSendWaitOptions,
    getIPTFAccounts,
    PAYMENT_AMOUNT,
} from "./utils";
import {
    bonds as bondsDeployment,
    stablecoin as stablecoinDeployment
} from "./data/deployments.json";
import escrowState from "./data/escrow.json";

const { L2_NODE_URL } = process.env;
if (!L2_NODE_URL) throw new Error("L2_NODE_URL not set in env");

const main = async () => {
    const node = createAztecNodeClient(L2_NODE_URL);

    let pxeConfig = {};
    if (await isTestnet(node)) pxeConfig = { proverEnabled: true };

    const { wallet, buyerAddress } = await getIPTFAccounts(node, pxeConfig);
    const opts = await getTestnetSendWaitOptions(node, wallet, buyerAddress);

    // load bond contract (needed for PXE awareness)
    const bondsAddress = AztecAddress.fromString(bondsDeployment.address);
    const bondsInstance = await node.getContract(bondsAddress);
    if (!bondsInstance) throw new Error(`Bonds contract not found at ${bondsAddress}`);
    await getBondContract(wallet, bondsAddress, bondsInstance);

    // load stablecoin contract
    const stablecoinAddress = AztecAddress.fromString(stablecoinDeployment.address);
    const stablecoinInstance = await node.getContract(stablecoinAddress);
    if (!stablecoinInstance) throw new Error(`Stablecoin contract not found at ${stablecoinAddress}`);
    const stablecoin = await getTokenContract(wallet, stablecoinAddress, stablecoinInstance);

    // load escrow contract
    const escrowAddress = AztecAddress.fromString(escrowState.address);
    const escrowInstance = await node.getContract(escrowAddress);
    if (!escrowInstance) throw new Error(`Escrow contract not found at ${escrowAddress}`);
    const escrowSecretKey = Fr.fromString(escrowState.secretKey);
    const escrow = await getEscrowContract(wallet, escrowAddress, escrowInstance, escrowSecretKey);

    // settle escrow (buyer pays stablecoins, receives bonds)
    console.log(`Settling escrow — paying ${PAYMENT_AMOUNT} stablecoins...`);
    const settleOpts = { send: { ...opts.send, additionalScopes: [escrow.address] } };
    const txHash = await settle(wallet, buyerAddress, escrow, stablecoin, PAYMENT_AMOUNT, settleOpts);
    console.log(`Escrow settled! TxHash: ${txHash}`);
}

main().then(() => process.exit(0));
