import fs from 'fs';
import path from 'path';
import { mongoManager } from '../server/db/mongodb.js';
import { MongoStorageService } from '../server/db/mongoStorage.js';

export interface MigrationReport {
  filesDiscovered: number;
  documentsMigrated: number;
  documentsSkipped: number;
  errors: Array<{ file: string; error: string }>;
  success: boolean;
}

export async function migrateGroupsToMongo(customGroupsDir?: string): Promise<MigrationReport> {
  const report: MigrationReport = {
    filesDiscovered: 0,
    documentsMigrated: 0,
    documentsSkipped: 0,
    errors: [],
    success: false
  };

  const groupsDir = customGroupsDir || path.resolve(process.cwd(), 'data', 'groups');
  console.log(`\n📦 [Migration] Starting Group Data Migration to MongoDB Atlas...`);
  console.log(`📁 Source directory: ${groupsDir}`);

  if (!fs.existsSync(groupsDir)) {
    console.warn(`⚠️ Source groups directory does not exist: ${groupsDir}`);
    report.success = true;
    return report;
  }

  const files = fs.readdirSync(groupsDir).filter(f => f.endsWith('.json'));
  report.filesDiscovered = files.length;
  console.log(`🔍 Discovered ${files.length} group JSON files to process.`);

  const db = await mongoManager.connect();
  if (!db) {
    const err = 'Cannot connect to MongoDB Atlas. Check MONGODB_URI configuration.';
    console.error(`❌ [Migration Error] ${err}`);
    report.errors.push({ file: 'DATABASE_CONNECTION', error: err });
    return report;
  }

  await MongoStorageService.ensureIndexes();

  for (const file of files) {
    const filePath = path.join(groupsDir, file);
    try {
      const rawContent = fs.readFileSync(filePath, 'utf-8');
      if (!rawContent || !rawContent.trim()) {
        report.documentsSkipped++;
        continue;
      }

      const groupData = JSON.parse(rawContent);
      const rawChatId = groupData.chat?.chatId || groupData.chatId || groupData.settings?.chatId;

      if (!rawChatId) {
        report.errors.push({ file, error: 'Missing chatId in group document' });
        report.documentsSkipped++;
        continue;
      }

      const saved = await MongoStorageService.saveGroup(groupData);
      if (saved) {
        report.documentsMigrated++;
      } else {
        report.errors.push({ file, error: 'Failed to write group to MongoDB' });
        report.documentsSkipped++;
      }
    } catch (err: any) {
      report.errors.push({ file, error: err?.message || 'JSON parse / migration failure' });
      report.documentsSkipped++;
    }
  }

  report.success = report.errors.length === 0;

  console.log(`\n==================================================`);
  console.log(`📊 MIGRATION SUMMARY:`);
  console.log(`- Files Discovered:   ${report.filesDiscovered}`);
  console.log(`- Documents Migrated: ${report.documentsMigrated}`);
  console.log(`- Documents Skipped:  ${report.documentsSkipped}`);
  console.log(`- Errors Encountered: ${report.errors.length}`);
  console.log(`==================================================\n`);

  return report;
}

if (import.meta.url === `file://${process.argv[1]}` || (process.argv[1] && process.argv[1].endsWith('migrateGroupsToMongo.ts'))) {
  migrateGroupsToMongo().then(async (res) => {
    await mongoManager.close();
    process.exit(res.success ? 0 : 1);
  }).catch(async (err) => {
    console.error('Fatal migration error:', err);
    await mongoManager.close();
    process.exit(1);
  });
}
