import fs from 'fs';
import path from 'path';
import { db, AUTHORITATIVE_ALLOWED_GROUP_IDS, AUTHORITATIVE_GROUP_METADATA } from '../server/db/storage.js';
import { mongoManager } from '../server/db/mongodb.js';
import { MongoStorageService } from '../server/db/mongoStorage.js';

export interface GroupPurgeReport {
  isDryRun: boolean;
  totalFound: number;
  allowedCount: number;
  removedCount: number;
  preservedCount: number;
  survivingGroups: Array<{ chatId: number; title: string }>;
  removedGroups: Array<{ chatId: number; title: string }>;
}

export async function runGroupPurgeScript(options: {
  execute?: boolean;
  force?: boolean;
} = {}): Promise<GroupPurgeReport> {
  const isExecute = options.execute === true;
  const isDryRun = !isExecute;

  console.log(`\n==================================================`);
  console.log(`🧹 [Authoritative Group Purge] Mode: ${isDryRun ? 'DRY RUN (No changes applied)' : 'EXECUTE (Applying destructive cleanup)'}`);
  console.log(`🎯 Authoritative Allowlist: ${AUTHORITATIVE_ALLOWED_GROUP_IDS.size} groups`);
  for (const id of AUTHORITATIVE_ALLOWED_GROUP_IDS) {
    console.log(`   - ${id} (${AUTHORITATIVE_GROUP_METADATA[id]?.title || 'Unknown'})`);
  }
  console.log(`==================================================\n`);

  // Connect to MongoDB if configured
  let isMongoConnected = false;
  if (process.env.MONGODB_URI?.trim()) {
    try {
      console.log('[PurgeScript] Connecting to MongoDB Atlas...');
      const dbInstance = await mongoManager.connect();
      isMongoConnected = Boolean(dbInstance);
      if (isMongoConnected) {
        console.log('[PurgeScript] Connected to MongoDB Atlas successfully.');
      }
    } catch (err: any) {
      console.warn('[PurgeScript] MongoDB Atlas connection error (proceeding with local):', err?.message);
    }
  }

  const groupsDir = path.resolve(process.cwd(), 'data', 'groups');
  const allFoundChatIds = new Set<number>();

  // 1. Gather all local group IDs
  if (fs.existsSync(groupsDir)) {
    try {
      const files = fs.readdirSync(groupsDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const numId = Number(file.replace('.json', ''));
        if (!isNaN(numId) && numId < 0) {
          allFoundChatIds.add(numId);
        }
      }
    } catch (err: any) {
      console.warn('[PurgeScript] Error reading groups directory:', err?.message);
    }
  }

  // 2. Gather from MongoDB if connected
  if (isMongoConnected) {
    try {
      const mongoDocs = await MongoStorageService.getAllGroups();
      for (const doc of mongoDocs) {
        const rawId = doc.chatId || doc.numChatId;
        const numId = Number(rawId);
        if (!isNaN(numId) && numId < 0) {
          allFoundChatIds.add(numId);
        }
      }
    } catch (err: any) {
      console.warn('[PurgeScript] Error querying MongoDB groups:', err?.message);
    }
  }

  // 3. Gather from DB memory
  const memoryGroups = db.getAllGroupSettings();
  for (const idStr of Object.keys(memoryGroups)) {
    const numId = Number(idStr);
    if (!isNaN(numId) && numId < 0) {
      allFoundChatIds.add(numId);
    }
  }

  const removedGroups: Array<{ chatId: number; title: string }> = [];
  const survivingGroups: Array<{ chatId: number; title: string }> = [];

  for (const chatId of allFoundChatIds) {
    const chatIdStr = String(chatId);
    const title = AUTHORITATIVE_GROUP_METADATA[chatIdStr]?.title || memoryGroups[chatId]?.chatTitle || `Group ${chatId}`;
    if (AUTHORITATIVE_ALLOWED_GROUP_IDS.has(chatIdStr)) {
      survivingGroups.push({ chatId, title });
    } else {
      removedGroups.push({ chatId, title });
    }
  }

  // Also include any allowed groups not yet in the found set
  for (const allowedIdStr of AUTHORITATIVE_ALLOWED_GROUP_IDS) {
    const numId = Number(allowedIdStr);
    if (!allFoundChatIds.has(numId)) {
      survivingGroups.push({
        chatId: numId,
        title: AUTHORITATIVE_GROUP_METADATA[allowedIdStr]?.title || `Group ${numId}`
      });
    }
  }

  const report: GroupPurgeReport = {
    isDryRun,
    totalFound: allFoundChatIds.size,
    allowedCount: AUTHORITATIVE_ALLOWED_GROUP_IDS.size,
    removedCount: removedGroups.length,
    preservedCount: survivingGroups.length,
    survivingGroups,
    removedGroups
  };

  if (isDryRun) {
    console.log(`📋 DRY RUN ANALYSIS:`);
    console.log(`- Total Groups Found: ${report.totalFound}`);
    console.log(`- Groups to be Removed: ${report.removedCount}`);
    console.log(`- Groups to be Preserved: ${report.preservedCount}\n`);

    if (removedGroups.length > 0) {
      console.log(`🗑️ Would remove the following ${removedGroups.length} groups:`);
      for (const g of removedGroups) {
        console.log(`   - [DELETE] ${g.chatId} (${g.title})`);
      }
      console.log('');
    }

    console.log(`✅ Would preserve the following ${survivingGroups.length} authoritative groups:`);
    for (const g of survivingGroups) {
      console.log(`   - [PRESERVE] ${g.chatId} (${g.title})`);
    }
  } else {
    console.log(`⚡ EXECUTING DESTRUCTIVE PURGE...`);
    const purgeResult = await db.purgeNonAuthoritativeGroups({ force: true });
    
    console.log(`\n==================================================`);
    console.log(`📊 CLEANUP SUMMARY:`);
    console.log(`- Mode:               EXECUTE`);
    console.log(`- Total Initial:      ${purgeResult.existingGroupsCount}`);
    console.log(`- Groups Removed:     ${purgeResult.removedGroupsCount}`);
    console.log(`- Jobs Removed:       ${purgeResult.removedAutoEngineJobsCount}`);
    console.log(`- Timers Removed:     ${purgeResult.removedTimersCount}`);
    console.log(`- Surviving Groups:   ${purgeResult.finalGroupsCount}`);
    console.log(`==================================================\n`);
  }

  return report;
}

// CLI execution
if (process.argv[1] && (process.argv[1].endsWith('purgeNonAuthoritativeGroups.ts') || process.argv[1].endsWith('purgeNonAuthoritativeGroups.js'))) {
  const isExecute = process.argv.includes('--execute') || process.argv.includes('-e');
  const isForce = process.argv.includes('--force');

  runGroupPurgeScript({ execute: isExecute, force: isForce })
    .then(async () => {
      if (mongoManager.getStatus().isConnected) {
        await mongoManager.close();
      }
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Fatal error during group purge script execution:', err);
      if (mongoManager.getStatus().isConnected) {
        await mongoManager.close();
      }
      process.exit(1);
    });
}
