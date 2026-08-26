import { PrismaClient } from "@prisma/client";
import { clippingBrowserManager } from "../src/services/clipping/ClippingBrowserManager.js";

const prisma = new PrismaClient();

// Headed login is a manual, one-time operation for a human to complete in a real browser
// window. The Settings page's "Log in" button does the same thing via POST
// /api/clipping-accounts/:id/login (safe only because this API always runs on the same
// local machine the window appears on) — this script is the terminal-only equivalent, for
// when the UI isn't running yet or you prefer the command line. Run directly:
//   npx tsx apps/api/scripts/clipping-login.ts <accountId>
async function main() {
  const accountId = process.argv[2];
  if (!accountId) {
    console.error("Usage: npx tsx apps/api/scripts/clipping-login.ts <accountId>");
    process.exit(1);
  }

  const account = await prisma.clippingAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    console.error(`No ClippingAccount found with id ${accountId}.`);
    process.exit(1);
  }

  console.log(`Opening a browser window — log into CLIPPING as "${account.label}" and this will detect it automatically...`);
  const { email, displayName } = await clippingBrowserManager.loginHeaded(account);
  await prisma.clippingAccount.update({
    where: { id: account.id },
    data: {
      lastLoginAt: new Date(),
      ...(email ? { email } : {}),
      ...(displayName ? { label: displayName } : {}),
    },
  });

  const label = displayName ?? account.label;
  console.log(`Session saved for "${label}"${email ? ` (${email})` : ""}. This account is ready to sync/submit through the app.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await clippingBrowserManager.shutdown();
  });
