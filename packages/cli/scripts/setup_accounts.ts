import "dotenv/config";
import { writeFileSync } from "fs";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getTestnetSendWaitOptions } from "./utils";
import { isTestnet } from "@iptf/contracts/utils";
import type { PXEConfig } from "@aztec/pxe/config";
import { Fr } from "@aztec/aztec.js/fields";

const { L2_NODE_URL } = process.env;
if (!L2_NODE_URL) throw new Error("L2_NODE_URL is not defined");

const main = async () => {
    const node = createAztecNodeClient(L2_NODE_URL);
    let pxeConfig: Partial<PXEConfig> = {};
    if (await isTestnet(node)) pxeConfig = { proverEnabled: true };

    // deploy issuer account
    console.log("Deploying issuer account...");
    const issuerWallet = await EmbeddedWallet.create(node, { pxeConfig });
    const issuerSecret = Fr.random();
    const issuerSalt = Fr.random();
    const issuerManager = await issuerWallet.createSchnorrAccount(issuerSecret, issuerSalt);
    const issuerOpts = await getTestnetSendWaitOptions(node, issuerWallet, issuerManager.address);
    await issuerManager.getDeployMethod()
        .then(deployMethod => deployMethod.send(issuerOpts.send));
    console.log(`Issuer deployed: ${issuerManager.address}`);

    // deploy seller account
    console.log("Deploying seller account...");
    const sellerWallet = await EmbeddedWallet.create(node, { pxeConfig });
    const sellerSecret = Fr.random();
    const sellerSalt = Fr.random();
    const sellerManager = await sellerWallet.createSchnorrAccount(sellerSecret, sellerSalt);
    const sellerOpts = await getTestnetSendWaitOptions(node, sellerWallet, sellerManager.address);
    await sellerManager.getDeployMethod()
        .then(deployMethod => deployMethod.send(sellerOpts.send));
    console.log(`Seller deployed: ${sellerManager.address}`);

    // deploy buyer account
    console.log("Deploying buyer account...");
    const buyerWallet = await EmbeddedWallet.create(node, { pxeConfig });
    const buyerSecret = Fr.random();
    const buyerSalt = Fr.random();
    const buyerManager = await buyerWallet.createSchnorrAccount(buyerSecret, buyerSalt);
    const buyerOpts = await getTestnetSendWaitOptions(node, buyerWallet, buyerManager.address);
    await buyerManager.getDeployMethod()
        .then(deployMethod => deployMethod.send(buyerOpts.send));
    console.log(`Buyer deployed: ${buyerManager.address}`);

    // save accounts to fs
    const accountData = {
        issuer: { secretKey: issuerSecret, salt: issuerSalt },
        seller: { secretKey: sellerSecret, salt: sellerSalt },
        buyer: { secretKey: buyerSecret, salt: buyerSalt },
    };
    const accountFilePath = `${__dirname}/data/accounts.json`;
    writeFileSync(accountFilePath, JSON.stringify(accountData, null, 2));
    console.log(`Wrote accounts to ${accountFilePath}`);
    console.log("Account setup complete!");
}

main().then(() => process.exit(0));
