import "dotenv/config";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { NO_FROM } from "@aztec/aztec.js/account";
import { Fr } from "@aztec/aztec.js/fields";
import { GrumpkinScalar } from "@aztec/foundation/curves/grumpkin";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import {
    bootstrapAztecFPC,
    deployAccountAztecFPC,
    deployAztecFPC,
    fundAztecFPC,
    claimAztecFPC,
} from "@jp4g/fpc-deployer";
import { deployTokenContract } from "@iptf/contracts/contract";
import { TOKEN_METADATA } from "@iptf/contracts/constants";
import { getSponsoredPaymentMethod, getPriorityFeeOptions } from "@iptf/contracts/fees";
import { isTestnet } from "@iptf/contracts/utils";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { testnetPriorityFee, testnetTimeout, testnetInterval } from "./utils";

const { L2_NODE_URL, L1_RPC_URL, L1_CHAIN_ID, L1_PRIVATE_KEY } = process.env;
if (!L2_NODE_URL) throw new Error("L2_NODE_URL not set in env");
if (!L1_RPC_URL) throw new Error("L1_RPC_URL not set in env");
if (!L1_CHAIN_ID) throw new Error("L1_CHAIN_ID not set in env");
if (!L1_PRIVATE_KEY) throw new Error("L1_PRIVATE_KEY not set in env");

const l1Config = {
    l1RpcUrl: L1_RPC_URL,
    l1ChainId: Number(L1_CHAIN_ID),
    l1PrivateKey: L1_PRIVATE_KEY,
};

const main = async () => {
    const node = createAztecNodeClient(L2_NODE_URL);
    console.log("Connected to Aztec node at", L2_NODE_URL);

    // =========================================================================
    // 1. Initiate bootstrap bridge (L1 tx only, does not wait for L1→L2)
    // =========================================================================
    console.log("Initiating bootstrap bridge...");
    const bootstrap = await bootstrapAztecFPC({
        l2Url: L2_NODE_URL,
        ...l1Config,
    });
    console.log(`Bootstrap bridge initiated for deployer: ${bootstrap.address}`);

    // =========================================================================
    // 1.5. Advance chain on local net (dummy txs for L1→L2 message availability)
    // =========================================================================
    if (!(await isTestnet(node))) {
        console.log("Local network detected — advancing chain with dummy txs...");
        const [testAccountData] = await getInitialTestAccountsData();
        const tempWallet = await EmbeddedWallet.create(node, { ephemeral: true });
        const tempAccount = await tempWallet.createSchnorrAccount(
            testAccountData.secret,
            testAccountData.salt,
            testAccountData.signingKey
        );
        const { contract: tempToken } = await deployTokenContract(
            tempWallet,
            tempAccount.address,
            { name: "Dummy", symbol: "DUM", decimals: 0 },
            { send: { from: tempAccount.address } }
        );
        for (let i = 1; i <= 2; i++) {
            await tempToken
                .withWallet(tempWallet)
                .methods.mint_to_private(tempAccount.address, 1n)
                .send({ from: tempAccount.address });
            console.log(`Dummy tx ${i}/2 complete`);
        }
        console.log("Chain advanced");
    }

    // =========================================================================
    // 2. Finalize bootstrap bridge (deploy deployer account)
    // =========================================================================
    console.log("Finalizing bootstrap bridge (deploying account)...");
    await deployAccountAztecFPC({
        l2Url: L2_NODE_URL,
        ...bootstrap,
        claim: bootstrap.claim,
    });
    console.log(`FPC deployer account deployed: ${bootstrap.address}`);

    // =========================================================================
    // 3. Deploy Sponsored FPC contract
    // =========================================================================
    console.log("Deploying Sponsored FPC contract...");
    const { fpcAddress } = await deployAztecFPC({
        l2Url: L2_NODE_URL,
        ...bootstrap,
    });
    console.log(`Sponsored FPC deployed: ${fpcAddress}`);

    // =========================================================================
    // 4. Initiate fund bridge (L1 tx only, does not wait for L1→L2)
    // =========================================================================
    console.log("Initiating FPC fund bridge...");
    const fund = await fundAztecFPC({
        l2Url: L2_NODE_URL,
        ...l1Config,
        ...bootstrap,
        fpcAddress,
        amount: 1000n * 10n ** 18n,
    });
    console.log(`Fund bridge initiated for FPC: ${fund.fpcAddress}`);

    // =========================================================================
    // 4.5. Advance chain on local net (dummy txs for fund bridge)
    // =========================================================================
    if (!(await isTestnet(node))) {
        console.log("Local network detected — advancing chain with dummy txs...");
        const [testAccountData] = await getInitialTestAccountsData();
        const tempWallet = await EmbeddedWallet.create(node, { ephemeral: true });
        const tempAccount = await tempWallet.createSchnorrAccount(
            testAccountData.secret,
            testAccountData.salt,
            testAccountData.signingKey
        );
        const { contract: tempToken } = await deployTokenContract(
            tempWallet,
            tempAccount.address,
            { name: "Dummy", symbol: "DUM", decimals: 0 },
            { send: { from: tempAccount.address } }
        );
        for (let i = 1; i <= 2; i++) {
            await tempToken
                .withWallet(tempWallet)
                .methods.mint_to_private(tempAccount.address, 1n)
                .send({ from: tempAccount.address });
            console.log(`Dummy tx ${i}/2 complete`);
        }
        console.log("Chain advanced");
    }

    // =========================================================================
    // 5. Finalize fund bridge (claim fee juice to FPC)
    // =========================================================================
    console.log("Finalizing fund bridge (claiming fee juice)...");
    const claimed = await claimAztecFPC({
        l2Url: L2_NODE_URL,
        ...bootstrap,
        fpcAddress,
        claim: fund.claim,
    });
    console.log(`FPC funded — balance: ${claimed.balance}`);

    // =========================================================================
    // 4. Create minter account using FPC for fees
    // =========================================================================
    console.log("Creating minter account...");
    let pxeConfig: Record<string, unknown> = { proverEnabled: false };

    const wallet = await EmbeddedWallet.create(node, { ephemeral: true, pxeConfig });
    const fpcAztecAddress = AztecAddress.fromString(fpcAddress);
    const paymentMethod = await getSponsoredPaymentMethod(node, wallet, fpcAztecAddress);

    const minterSalt = Fr.random();
    const minterSecretKey = Fr.random();
    const minterSigningKey = GrumpkinScalar.random();

    const minterAccount = await wallet.createSchnorrAccount(
        minterSecretKey,
        minterSalt,
        minterSigningKey
    );

    let deployFee: Record<string, unknown> = { paymentMethod };
    if (await isTestnet(node)) {
        const priorityFee = await getPriorityFeeOptions(node, testnetPriorityFee);
        deployFee = { ...priorityFee, paymentMethod };
    }

    const deployMethod = await minterAccount.getDeployMethod();
    await deployMethod.send({
        from: NO_FROM,
        fee: deployFee,
    } as any);

    const minterAddress = minterAccount.address;
    console.log(`Minter account deployed: ${minterAddress}`);

    const minterCredentials = {
        address: minterAddress.toString(),
        secretKey: minterSecretKey.toString(),
        salt: minterSalt.toString(),
        signingKey: minterSigningKey.toString(),
    };

    // =========================================================================
    // 5. Deploy stablecoin with minter as admin
    // =========================================================================
    console.log("Deploying stablecoin Token contract...");
    const minterWallet = wallet;

    const sendOpts: Record<string, unknown> = { from: minterAddress, fee: deployFee };
    if (await isTestnet(node)) {
        sendOpts.wait = { timeout: testnetTimeout, interval: testnetInterval };
    }

    const { contract: stablecoin } = await deployTokenContract(
        minterWallet,
        minterAddress,
        TOKEN_METADATA.stablecoin,
        { send: sendOpts as any }
    );
    console.log(`Stablecoin deployed: ${stablecoin.address}`);

    // =========================================================================
    // 6. Write outputs
    // =========================================================================
    const deployments = {
        fpc: { address: fpcAddress },
        stablecoin: { address: stablecoin.address.toString() },
        minter: minterCredentials,
    };

    const deploymentsPath = resolve(__dirname, "data/deployments.json");
    writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
    console.log(`Deployments written to ${deploymentsPath}`);

    const envLocalPath = resolve(__dirname, "../../frontend/.env.local");
    const envContent = [
        `NEXT_PUBLIC_AZTEC_NODE_URL=${L2_NODE_URL}`,
        `NEXT_PUBLIC_SPONSORED_FPC_ADDRESS=${fpcAddress}`,
        `NEXT_PUBLIC_STABLECOIN_ADDRESS=${stablecoin.address}`,
        `NEXT_PUBLIC_STABLECOIN_MINTER=${JSON.stringify(minterCredentials)}`,
    ].join("\n") + "\n";
    writeFileSync(envLocalPath, envContent);
    console.log(`Frontend env written to ${envLocalPath}`);
};

main().then(() => process.exit(0));
