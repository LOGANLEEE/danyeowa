#!/usr/bin/env node
// Generates a VAPID (P-256) keypair for Web Push.
//
// Default mode: prints the PUBLIC key + instructions only. The private key is
// never written to stdout, a file, or any log in this mode — it simply isn't
// derived until --put is passed.
//
// --put mode: generates a fresh keypair and pipes the PRIVATE key directly into
// `wrangler secret put VAPID_PRIVATE_KEY`'s stdin, so it is never echoed to the
// terminal, written to a file, or captured in shell history. Only the public key
// is printed (for pasting into wrangler.jsonc `vars`).
//
// --local mode: prints BOTH keys of a freshly generated keypair to stdout, for pasting
// into .dev.vars (gitignored) as a LOCAL-ONLY dev keypair. Never use this for the prod
// keypair — prod's private key must only ever reach wrangler via --put's stdin pipe.
//
// Usage:
//   node scripts/generate-vapid.mjs            # print public key + instructions
//   node scripts/generate-vapid.mjs --put      # generate + upload private key as a
//                                               #   Worker secret via wrangler
//   node scripts/generate-vapid.mjs --local    # print both keys, for .dev.vars only
import { spawn } from "node:child_process";
import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;

/** Base64url-encode raw bytes (no padding). */
function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return Buffer.from(binary, "binary").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generateKeyPair() {
  const keyPair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);

  // Raw uncompressed public key: 65 bytes (0x04 || X || Y), the format Web Push /
  // browsers' pushManager.subscribe(applicationServerKey) expect.
  const rawPublic = await subtle.exportKey("raw", keyPair.publicKey);
  const publicKey = base64url(new Uint8Array(rawPublic));

  // PKCS8 private key — the format the VAPID JWT signer (Task 2) will import via
  // subtle.importKey("pkcs8", ...).
  const pkcs8Private = await subtle.exportKey("pkcs8", keyPair.privateKey);
  const privateKey = base64url(new Uint8Array(pkcs8Private));

  return { publicKey, privateKey };
}

async function putSecret(privateKey) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["wrangler", "secret", "put", "VAPID_PRIVATE_KEY"], {
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`wrangler secret put exited with code ${code}`));
    });
    child.stdin.write(privateKey);
    child.stdin.end();
  });
}

async function main() {
  const put = process.argv.includes("--put");
  const local = process.argv.includes("--local");
  const { publicKey, privateKey } = await generateKeyPair();

  if (put) {
    console.log("Uploading VAPID_PRIVATE_KEY as a Worker secret (value is never printed)...");
    await putSecret(privateKey);
    console.log("\nDone. Public key (add to wrangler.jsonc `vars.VAPID_PUBLIC_KEY`):\n");
    console.log(publicKey);
    return;
  }

  if (local) {
    console.log("Generated a LOCAL DEV-ONLY keypair. Paste into .dev.vars (gitignored) —");
    console.log("do NOT reuse this for prod, and do NOT commit it anywhere:\n");
    console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
    console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
    return;
  }

  console.log("Generated a VAPID keypair. This mode does NOT upload the private key.\n");
  console.log("Public key (safe to commit as a wrangler.jsonc `vars.VAPID_PUBLIC_KEY`):\n");
  console.log(publicKey);
  console.log("\nTo generate a DIFFERENT keypair and upload its private key as the prod");
  console.log("Worker secret, re-run with --put:\n");
  console.log("  node scripts/generate-vapid.mjs --put\n");
  console.log("For LOCAL dev, generate a SEPARATE keypair (do not reuse the prod one) and");
  console.log("put its keys in .dev.vars (gitignored):\n");
  console.log("  VAPID_PUBLIC_KEY=<public key>");
  console.log("  VAPID_PRIVATE_KEY=<private key>");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
