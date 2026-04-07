#!/usr/bin/env tsx

import { copyFile, readFile, writeFile, mkdir, rename, unlink } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "node:url";

async function copyFileWithLog(src: string, dest: string): Promise<void> {
  try {
    await copyFile(src, dest);
    console.log(`Copied: ${src} -> ${dest}`);
  } catch (error) {
    throw new Error(`Failed to copy ${src} to ${dest}: ${error}`);
  }
}

async function moveFileWithLog(src: string, dest: string): Promise<void> {
  try {
    await rename(src, dest);
    console.log(`Moved: ${src} -> ${dest}`);
  } catch (error) {
    throw new Error(`Failed to move ${src} to ${dest}: ${error}`);
  }
}

async function replaceInFile(filePath: string, searchText: string, replaceText: string): Promise<void> {
  try {
    const content = await readFile(filePath, "utf-8");
    const updatedContent = content.replace(new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replaceText);
    await writeFile(filePath, updatedContent, "utf-8");
    console.log(`Updated imports in: ${filePath}`);
  } catch (error) {
    throw new Error(`Failed to update file ${filePath}: ${error}`);
  }
}

interface ArtifactEntry {
  /** Name used in the compiled JSON filename, e.g. "private_bonds" */
  compiledName: string;
  /** Name used in the codegen TS/JSON files, e.g. "PrivateBonds" */
  className: string;
  /** Subdirectory under artifacts/, e.g. "private_bonds" */
  subdir: string;
}

const ARTIFACTS: ArtifactEntry[] = [
  { compiledName: "private_bonds", className: "PrivateBonds", subdir: "private_bonds" },
  { compiledName: "dvp_escrow", className: "DvPEscrow", subdir: "dvp_escrow" },
  { compiledName: "dvp_escrow", className: "Token", subdir: "token" },
];

async function main() {
  try {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const rootDir = join(scriptDir, "..");

    console.log(`Working in project directory: ${rootDir}`);
    process.chdir(rootDir);

    for (const artifact of ARTIFACTS) {
      const subdir = `./ts/src/artifacts/${artifact.subdir}`;
      const topLevelTs = `./ts/src/artifacts/${artifact.className}.ts`;
      const subdirTs = `${subdir}/${artifact.className}.ts`;
      const compiledJson = `./contracts/target/${artifact.compiledName}-${artifact.className}.json`;
      const subdirJson = `${subdir}/${artifact.className}.json`;

      console.log(`\nProcessing ${artifact.className}...`);

      // Ensure subdirectory exists
      await mkdir(subdir, { recursive: true });

      // Copy compiled JSON into subdirectory
      await copyFileWithLog(compiledJson, subdirJson);

      // Move codegen'd TS into subdirectory and fix its import path
      await moveFileWithLog(topLevelTs, subdirTs);
      await replaceInFile(
        subdirTs,
        `../../../contracts/target/${artifact.compiledName}-${artifact.className}.json`,
        `./${artifact.className}.json`
      );
    }

    console.log("\nArtifacts moved and imports fixed successfully!");

  } catch (error) {
    console.error("Script failed:", error);
    process.exit(1);
  }
}

main();
