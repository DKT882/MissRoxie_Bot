import fs from 'fs';
import path from 'path';
import { mongoManager } from '../server/db/mongodb.js';
import { MongoStorageService } from '../server/db/mongoStorage.js';

export interface CleanupReport {
  isDryRun: boolean;
  totalFound: number;
  markedUnavailable: number;
  purged: number;
  skipped: number;
  errors: Array<{ chatId: string | number; error: string }>;
  details: Array<{ chatId: string | number; botId?: number | null; reason: string; action: string }>;
}

export async function safeStaleGroupCleanup(options: {
  execute?: boolean;
  botId?: number;
  chatId?: number;
  purge?: boolean;
  customGroupsDir?: string;
} = {}): Promise<CleanupReport> {
  const isExecute = options.execute === true;
  const isDryRun = !isExecute;
  const targetBotId = options.botId;
  const targetChatId = options.chatId;
  const isPurge = options.purge === true;

  const report: CleanupReport = {
    isDryRun,
    totalFound: 0,
    markedUnavailable: 0,
    purged: 0,
    skipped: 0,
    errors: [],
    details: []
  };

  console.log(`\n🧹 [Safe Stale Group Cleanup] Mode: ${isDryRun ? 'DRY-RUN (No changes applied)' : 'EXECUTE (Applying changes)'}`);
  if (targetBotId !== undefined) console.log(`🎯 Filter Bot ID: ${targetBotId}`);
  if (targetChatId !== undefined) console.log(`🎯 Filter Chat ID: ${targetChatId}`);
  console.log(`⚙️ Action mode: ${isPurge ? 'HARD PURGE (Delete)' : 'SOFT MARK (Set botLeft=true, unavailable=true)'}\n`);

  const groupsDir = options.customGroupsDir || path.resolve(process.cwd(), 'data', 'groups');

  // 1. Process Local Disk Files
  if (fs.existsSync(groupsDir)) {
    const files = fs.readdirSync(groupsDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const filePath = path.join(groupsDir, file);
      try {
        const rawContent = fs.readFileSync(filePath, 'utf-8');
        if (!rawContent || !rawContent.trim()) continue;

        const data = JSON.parse(rawContent);
        const chatId = Number(data.chat?.chatId || data.chatId || data.settings?.chatId || file.replace('.json', ''));
        const docBotId = data.botId !== undefined ? data.botId : data.settings?.botId;

        if (targetChatId !== undefined && chatId !== targetChatId) continue;
        if (targetBotId !== undefined && docBotId !== undefined && docBotId !== null && docBotId !== targetBotId) continue;

        // Check if group is considered stale or invalid
        const isLegacyUnassigned = docBotId === undefined || docBotId === null;
        const isUnavailable = data.settings?.unavailable === true || data.settings?.botLeft === true;
        const isDummyId = Math.abs(chatId) < 1000 || String(chatId).includes('99999999');

        if (isLegacyUnassigned || isUnavailable || isDummyId || targetChatId !== undefined) {
          report.totalFound++;
          const reason = isDummyId ? 'Dummy or test chat ID' : isUnavailable ? 'Already marked unavailable' : 'Legacy unassigned group';

          if (isDryRun) {
            report.details.push({ chatId, botId: docBotId, reason, action: isPurge ? 'WOULD_PURGE_LOCAL' : 'WOULD_MARK_LOCAL' });
          } else {
            if (isPurge) {
              fs.unlinkSync(filePath);
              report.purged++;
              report.details.push({ chatId, botId: docBotId, reason, action: 'PURGED_LOCAL' });
            } else {
              if (data.settings) {
                data.settings.botLeft = true;
                data.settings.unavailable = true;
                data.settings.unavailableReason = reason;
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
                report.markedUnavailable++;
                report.details.push({ chatId, botId: docBotId, reason, action: 'MARKED_LOCAL' });
              }
            }
          }
        }
      } catch (err: any) {
        report.errors.push({ chatId: file, error: err?.message || 'Local file processing failure' });
      }
    }
  }

  // 2. Process MongoDB if connected
  const isMongoConnected = mongoManager.getStatus().isConnected;
  if (isMongoConnected) {
    try {
      const db = mongoManager.getDb();
      if (db) {
        const collection = db.collection('groups');
        const query: any = {};
        if (targetBotId !== undefined) query.botId = targetBotId;
        if (targetChatId !== undefined) {
          query.$or = [{ chatId: String(targetChatId) }, { numChatId: Number(targetChatId) }];
        }

        const cursor = collection.find(query);
        while (await cursor.hasNext()) {
          const doc = await cursor.next();
          if (!doc) break;

          const numChatId = doc.numChatId || Number(doc.chatId);
          const docBotId = doc.botId;
          const isUnavailable = doc.settings?.unavailable === true || doc.settings?.botLeft === true;
          const isDummyId = Math.abs(numChatId) < 1000 || String(numChatId).includes('99999999');
          const isLegacyUnassigned = docBotId === undefined || docBotId === null;

          if (isLegacyUnassigned || isUnavailable || isDummyId || targetChatId !== undefined) {
            const reason = isDummyId ? 'Dummy or test chat ID' : isUnavailable ? 'Already marked unavailable' : 'Legacy unassigned group';
            if (isDryRun) {
              report.details.push({ chatId: numChatId, botId: docBotId, reason, action: isPurge ? 'WOULD_PURGE_MONGO' : 'WOULD_MARK_MONGO' });
            } else {
              if (isPurge) {
                await collection.deleteOne({ _id: doc._id });
                report.purged++;
                report.details.push({ chatId: numChatId, botId: docBotId, reason, action: 'PURGED_MONGO' });
              } else {
                await collection.updateOne(
                  { _id: doc._id },
                  {
                    $set: {
                      'settings.botLeft': true,
                      'settings.unavailable': true,
                      'settings.unavailableReason': reason,
                      updatedAt: new Date()
                    }
                  }
                );
                report.markedUnavailable++;
                report.details.push({ chatId: numChatId, botId: docBotId, reason, action: 'MARKED_MONGO' });
              }
            }
          }
        }
      }
    } catch (err: any) {
      report.errors.push({ chatId: 'MONGODB', error: err?.message || 'MongoDB query failure' });
    }
  }

  console.log(`\n==================================================`);
  console.log(`📊 CLEANUP SUMMARY:`);
  console.log(`- Mode:               ${isDryRun ? 'DRY RUN' : 'EXECUTED'}`);
  console.log(`- Total Targets:      ${report.totalFound}`);
  console.log(`- Marked Unavailable: ${report.markedUnavailable}`);
  console.log(`- Purged:             ${report.purged}`);
  console.log(`- Errors:             ${report.errors.length}`);
  console.log(`==================================================\n`);

  return report;
}

if (import.meta.url === `file://${process.argv[1]}` || (process.argv[1] && process.argv[1].endsWith('safeStaleGroupCleanup.ts'))) {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const purge = args.includes('--purge');
  const botIdIdx = args.indexOf('--bot-id');
  const botId = botIdIdx !== -1 && args[botIdIdx + 1] ? Number(args[botIdIdx + 1]) : undefined;
  const chatIdIdx = args.indexOf('--chat-id');
  const chatId = chatIdIdx !== -1 && args[chatIdIdx + 1] ? Number(args[chatIdIdx + 1]) : undefined;

  safeStaleGroupCleanup({ execute, botId, chatId, purge }).then(async () => {
    if (mongoManager.getStatus().isConnected) {
      await mongoManager.close();
    }
    process.exit(0);
  }).catch(async (err) => {
    console.error('Fatal cleanup error:', err);
    if (mongoManager.getStatus().isConnected) {
      await mongoManager.close();
    }
    process.exit(1);
  });
}
