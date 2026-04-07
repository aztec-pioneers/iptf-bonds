// Display helpers
export function truncateAddress(address: string, prefix = 6, suffix = 4): string {
  if (address.length <= prefix + suffix + 3) return address;
  return `${address.slice(0, prefix)}...${address.slice(-suffix)}`;
}

export function formatMaturityDate(unixTimestamp: bigint): string {
  const date = new Date(Number(unixTimestamp) * 1000);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getTimeRemaining(
  currentBlockTime: bigint,
  maturityUnix: bigint
): { expired: boolean; display: string } {
  if (currentBlockTime >= maturityUnix) {
    return { expired: true, display: "Matured" };
  }

  const remaining = Number(maturityUnix - currentBlockTime);
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);

  if (days > 0) {
    return { expired: false, display: `${days}d ${hours}h remaining` };
  }
  const minutes = Math.floor((remaining % 3600) / 60);
  return { expired: false, display: `${hours}h ${minutes}m remaining` };
}

// USDC formatting (6 decimals)
const TOKEN_DECIMALS = 6;
const TOKEN_SCALE = 10n ** BigInt(TOKEN_DECIMALS);

export function formatUsdcAmount(raw: string | bigint): string {
  const value = typeof raw === "string" ? BigInt(raw) : raw;
  const whole = value / TOKEN_SCALE;
  const frac = value % TOKEN_SCALE;
  const fracStr = frac.toString().padStart(TOKEN_DECIMALS, "0").replace(/0+$/, "");
  return fracStr.length > 0 ? `${whole}.${fracStr.padEnd(2, "0")}` : `${whole}.00`;
}

export function parseUsdcToRaw(display: string): bigint {
  const [wholePart, fracPart = ""] = display.split(".");
  const padded = fracPart.slice(0, TOKEN_DECIMALS).padEnd(TOKEN_DECIMALS, "0");
  return BigInt(wholePart) * TOKEN_SCALE + BigInt(padded);
}

export function formatUnitPrice(paymentRaw: string | bigint, bondAmount: string | bigint): string {
  const payment = typeof paymentRaw === "string" ? BigInt(paymentRaw) : paymentRaw;
  const bonds = typeof bondAmount === "string" ? BigInt(bondAmount) : bondAmount;
  if (bonds === 0n) return "0.0000";
  // Multiply by 10000 for 4 decimal places, then format
  const scaled = (payment * 10000n) / (bonds * TOKEN_SCALE);
  const whole = scaled / 10000n;
  const frac = (scaled % 10000n).toString().padStart(4, "0");
  return `${whole}.${frac}`;
}

// Name encoding/decoding for Field storage
export function encodeNameToField(name: string): bigint {
  const bytes = new TextEncoder().encode(name.slice(0, 31));
  let value = 0n;
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  return value;
}

export function decodeNameFromField(field: bigint | string): string {
  const value = typeof field === "string" ? BigInt(field) : field;
  if (value === 0n) return "";
  const bytes: number[] = [];
  let v = value;
  while (v > 0n) {
    bytes.unshift(Number(v & 0xffn));
    v >>= 8n;
  }
  return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\0+$/, "");
}
