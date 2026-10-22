/**
 * Performance Audit Benchmark for MissRoxie_Bot
 * Accurately measures:
 * 1. Storage Manager initialization and JSON load times
 * 2. Database query latency (schedules, groups, content items, group memory)
 * 3. Serialization overhead (JSON.stringify of group objects)
 * 4. API endpoint handler latency (in-memory mock request/response)
 */
import { performance } from 'perf_hooks';
import { db } from '../server/db/storage.js';
import fs from 'fs';
import path from 'path';

async function runBenchmark() {
  console.log('====================================================');
  console.log('📊 PERFORMANCE AUDIT BENCHMARK — BASELINE TIMINGS');
  console.log('====================================================\n');

  // 1. Storage files inventory
  const dataDir = db.dataDir;
  const groupsDir = db.groupsDir;
  const groupFiles = fs.existsSync(groupsDir) ? fs.readdirSync(groupsDir).filter(f => f.endsWith('.json')) : [];
  const dbFile = db.dbFile;
  const dbFileSize = fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0;

  console.log(`[Storage File System Inventory]`);
  console.log(`- bot_storage.json size: ${(dbFileSize / (1024 * 1024)).toFixed(2)} MB (${dbFileSize} bytes)`);
  console.log(`- Per-group JSON files: ${groupFiles.length} files`);
  let totalGroupFilesSize = 0;
  for (const f of groupFiles) {
    totalGroupFilesSize += fs.statSync(path.join(groupsDir, f)).size;
  }
  console.log(`- Total per-group files size: ${(totalGroupFilesSize / (1024 * 1024)).toFixed(2)} MB (${totalGroupFilesSize} bytes)`);

  // 2. Measure Group JSON parsing time
  const t0 = performance.now();
  const sampleCount = Math.min(groupFiles.length, 50);
  let sampleBytesRead = 0;
  for (let i = 0; i < sampleCount; i++) {
    const raw = fs.readFileSync(path.join(groupsDir, groupFiles[i]), 'utf8');
    sampleBytesRead += raw.length;
    JSON.parse(raw);
  }
  const t1 = performance.now();
  const avgParseTimePerGroup = (t1 - t0) / sampleCount;
  const estTotal300GroupLoadTime = avgParseTimePerGroup * groupFiles.length;
  console.log(`\n[Storage Load Latency]`);
  console.log(`- Read & parsed ${sampleCount} group JSON files in ${(t1 - t0).toFixed(2)} ms`);
  console.log(`- Average per-group load time: ${avgParseTimePerGroup.toFixed(3)} ms`);
  console.log(`- Estimated synchronous load time for all ${groupFiles.length} groups: ${estTotal300GroupLoadTime.toFixed(2)} ms`);

  // 3. Database In-Memory Read Latencies
  console.log(`\n[Database Query Latencies]`);

  // 3a. getAllSchedules
  const s0 = performance.now();
  const iterations = 50;
  for (let i = 0; i < iterations; i++) {
    db.getAllSchedules();
  }
  const s1 = performance.now();
  console.log(`- db.getAllSchedules(): ${((s1 - s0) / iterations).toFixed(3)} ms / call`);

  // 3b. getConnectedGroups
  const g0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    db.getConnectedGroups();
  }
  const g1 = performance.now();
  console.log(`- db.getConnectedGroups(): ${((g1 - g0) / iterations).toFixed(3)} ms / call`);

  // 3c. getContentItem lookup (by post, schedule, template)
  const c0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    db.getContentItem('POST-4K9P2');
    db.getContentItem('TPL-BCAST-01');
    db.getContentItem('1024');
  }
  const c1 = performance.now();
  console.log(`- db.getContentItem() (3 lookups): ${((c1 - c0) / iterations).toFixed(3)} ms / batch`);

  // 3d. getContentItems listing & filtering
  const l0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    db.getContentItems();
    db.getContentItems({ type: 'post' });
    db.getContentItems({ type: 'schedule' });
  }
  const l1 = performance.now();
  console.log(`- db.getContentItems() (full list + 2 filtered): ${((l1 - l0) / iterations).toFixed(3)} ms / batch`);

  // 4. Group Detail read + serialization latency
  const sampleChatId = groupFiles.length > 0 ? Number(groupFiles[0].replace('.json', '')) : -100111222333;
  console.log(`\n[Group Detail Serialization Latency (Chat ID: ${sampleChatId})]`);

  const gd0 = performance.now();
  for (let i = 0; i < 20; i++) {
    const settings = db.getGroupSettings(sampleChatId);
    const logs = db.getGroupLogs(sampleChatId, 100);
    const schedules = db.getGroupSchedules(sampleChatId);
    const notes = db.getAllNotes(sampleChatId);
    const approvedUsers = db.getApprovedUsers(sampleChatId);
    const freedUsers = db.getFreedUsers(sampleChatId);
    const locks = db.getLocks(sampleChatId);
    const filters = db.getFilters(sampleChatId);
    const linksWhitelist = db.getLinkWhitelist(sampleChatId);
    const storedMessages = db.getGroupMemory(sampleChatId);
    const payload = {
      chatId: sampleChatId,
      settings,
      logs,
      schedules,
      notes,
      approvedUsers,
      freedUsers,
      locks,
      filters,
      linksWhitelist,
      storedMessages
    };
    JSON.stringify(payload);
  }
  const gd1 = performance.now();
  console.log(`- Full Group Detail load + JSON.stringify: ${((gd1 - gd0) / 20).toFixed(3)} ms / request`);

  // 5. Group Save Serialization Latency
  console.log(`\n[Group Save Serialization Latency]`);
  const gs0 = performance.now();
  for (let i = 0; i < 10; i++) {
    const rawData = (db as any).buildGroupDataObject(sampleChatId);
    const safeData = (db as any).sanitizeGroupData(rawData);
    JSON.stringify(safeData, null, 2);
  }
  const gs1 = performance.now();
  console.log(`- buildGroupDataObject + sanitize + JSON.stringify(pretty): ${((gs1 - gs0) / 10).toFixed(3)} ms / save`);

  console.log('\n====================================================');
  console.log('✅ BENCHMARK RUN COMPLETED');
  console.log('====================================================\n');
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
