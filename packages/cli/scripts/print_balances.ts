import "dotenv/config";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { getBondContract, getTokenContract } from "@iptf/contracts/contract";
import { getIPTFAccounts } from "./utils";
import {
    bonds as bondsDeployment,
    stablecoin as stablecoinDeployment
} from "./data/deployments.json";

const { L2_NODE_URL } = process.env;
if (!L2_NODE_URL) throw new Error("L2_NODE_URL not set in env");

const main = async () => {
    const node = createAztecNodeClient(L2_NODE_URL);
    const { wallet, issuerAddress, sellerAddress, buyerAddress } = await getIPTFAccounts(node);

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

    // query balances
    const issuerBonds = await bonds.methods.private_balance_of(issuerAddress).simulate({ from: issuerAddress });
    const sellerBonds = await bonds.methods.private_balance_of(sellerAddress).simulate({ from: sellerAddress });
    const buyerBonds = await bonds.methods.private_balance_of(buyerAddress).simulate({ from: buyerAddress });

    const sellerStable = await stablecoin.methods.balance_of_private(sellerAddress).simulate({ from: sellerAddress });
    const buyerStable = await stablecoin.methods.balance_of_private(buyerAddress).simulate({ from: buyerAddress });

    console.log("==================[Bond Balances]==================");
    console.log(`Issuer:  ${issuerBonds.result}`);
    console.log(`Seller:  ${sellerBonds.result}`);
    console.log(`Buyer:   ${buyerBonds.result}`);
    console.log("===============[Stablecoin Balances]===============");
    console.log(`Seller:  ${sellerStable.result}`);
    console.log(`Buyer:   ${buyerStable.result}`);
    console.log("===================================================");
}

main().then(() => process.exit(0));
