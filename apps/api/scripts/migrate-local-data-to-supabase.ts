// One-time migration: copies this app's existing local Postgres data into a Supabase Postgres
// database, tagging every row with the given userId (a real Supabase auth user id, created by
// hand via sign-up first — this script never creates a user itself).
//
// Not run automatically — a deliberate, reviewed step. Run against a Supabase branch/test
// project first and spot-check before pointing this at a production database.
//
// Usage:
//   npx tsx scripts/migrate-local-data-to-supabase.ts \
//     --user-id=<supabase-auth-user-uuid> \
//     --source="$LOCAL_DATABASE_URL" \
//     --target="$SUPABASE_DATABASE_URL"
//
// The target database must already have the multi-user-auth migration applied
// (`npx prisma migrate deploy` against it) — this script only INSERTs rows, it doesn't create
// schema.

import { Client } from "pg";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function main() {
  const userId = arg("user-id");
  const sourceUrl = arg("source") ?? process.env.LOCAL_DATABASE_URL;
  const targetUrl = arg("target") ?? process.env.SUPABASE_DATABASE_URL;

  if (!userId || !sourceUrl || !targetUrl) {
    console.error(
      "Usage: npx tsx scripts/migrate-local-data-to-supabase.ts --user-id=<uuid> --source=<local DATABASE_URL> --target=<Supabase DATABASE_URL>"
    );
    process.exit(1);
  }

  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });
  await source.connect();
  await target.connect();

  try {
    await target.query("BEGIN");

    // Dependency order: accounts first (clipping_accounts has no FK dependency on
    // instagram_accounts, but instagram_accounts.clippingAccountRefId points at it), then
    // creators before reels (reels.creatorId), then reels before anything that references a
    // reel, then everything else.
    const tables: Array<{ name: string; columns: string[] }> = [
      { name: "clipping_accounts", columns: ["id", "label", "email", "apiUrl", "campaignId", "storageStatePath", "active", "lastUsedAt", "lastLoginAt", "lastPayout", "lastPayoutBountyBreakdown", "lastPayoutFetchedAt", "createdAt", "updatedAt"] },
      { name: "instagram_accounts", columns: ["id", "instagramId", "username", "displayName", "active", "accessToken", "clippingAccountId", "clippingOwnerEmail", "clippingAccountRefId", "lastSyncedAt", "createdAt", "updatedAt"] },
      { name: "creators", columns: ["id", "detectedIdentifier", "displayName", "active", "createdAt", "updatedAt"] },
      { name: "creator_aliases", columns: ["id", "creatorId", "detectedIdentifier", "createdAt"] },
      { name: "reels", columns: ["id", "instagramAccountId", "instagramReelId", "instagramUrl", "thumbnailUrl", "publishedAt", "views", "creatorId", "detectedIdentifier", "creatorDetectionStatus", "createdAt", "updatedAt"] },
      { name: "clipping_bounties", columns: ["id", "name", "active", "rate", "lastSeenAt", "createdAt", "updatedAt"] },
      { name: "clipping_submissions", columns: ["id", "reelId", "clippingClipId", "videoId", "campaignId", "bountyTag", "clippingUrl", "status", "isBeingTracked", "views", "likes", "comments", "dateAdded", "dateCreated", "lastUpdated", "createdAt", "updatedAt"] },
      { name: "submission_attempts", columns: ["id", "reelId", "status", "errorMessage", "attemptedAt"] },
      { name: "activity_logs", columns: ["id", "message", "level", "createdAt"] },
    ];

    for (const table of tables) {
      const { rows } = await source.query(`SELECT * FROM ${table.name}`);
      if (rows.length === 0) {
        console.log(`${table.name}: 0 rows, skipping`);
        continue;
      }

      const insertColumns = [...table.columns, "userId"];
      const columnList = insertColumns.map((c) => `"${c}"`).join(", ");
      let inserted = 0;

      for (const row of rows) {
        // node-postgres serializes a plain JS array/object parameter as a Postgres ARRAY
        // literal ("{...}"), not JSON text — fine for most columns, but corrupts the one
        // actual jsonb column (clipping_accounts.lastPayoutBountyBreakdown). Stringifying it
        // ourselves sends it as plain text instead, which Postgres parses correctly as jsonb.
        const values = [
          ...table.columns.map((c) => {
            const value = row[c];
            return c === "lastPayoutBountyBreakdown" && value !== null ? JSON.stringify(value) : value;
          }),
          userId,
        ];
        const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
        await target.query(
          `INSERT INTO ${table.name} (${columnList}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
          values
        );
        inserted += 1;
      }
      console.log(`${table.name}: copied ${inserted} of ${rows.length} rows`);
    }

    await target.query("COMMIT");
    console.log(`\nDone — all rows tagged with userId ${userId}.`);
  } catch (error) {
    await target.query("ROLLBACK");
    throw error;
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
