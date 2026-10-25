import http from 'http';
import zlib from 'zlib';
import { db } from '../server/db/storage.js';
import { bandwidthTracker } from '../server/observability/bandwidthTracker.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`✅ PASS: ${message}`);
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 MissRoxie_Bot Bandwidth Optimization Test Suite');
  console.log('======================================================\n');

  // Test 1: Bandwidth Tracker Core Telemetry
  console.log('--- Test 1: Bandwidth Tracker Recording & Privacy Safety ---');
  bandwidthTracker.reset();
  bandwidthTracker.recordHttpResponse('/api/dashboard/groups', 200, 4800, 0, false, 131200);
  bandwidthTracker.recordHttpResponse('/api/dashboard/overview', 304, 0, 0, true, 0);
  bandwidthTracker.recordExternalCall('api.telegram.org:sendMessage', 420, 150);
  bandwidthTracker.recordMongoOp('getGroup');

  const summary = bandwidthTracker.getSummary();
  assert(summary.totals.totalRequests === 2, 'Total HTTP requests recorded');
  assert(summary.totals.cached304Responses === 1, 'Total 304 Not Modified responses recorded');
  assert(summary.totals.totalOutboundBytes === 4800, 'Total outbound bytes recorded accurately');
  assert(summary.totals.compressionSavingsBytes === 131200, 'Compression savings recorded');
  assert(summary.externalTraffic.length === 1, 'External traffic destination recorded');
  assert(summary.externalTraffic[0].estimatedOutboundBytes === 420, 'Telegram API outbound bytes recorded');
  assert(summary.mongoDbOperations.getGroup === 1, 'MongoDB operations recorded');
  assert(!JSON.stringify(summary).includes('token'), 'No secrets or tokens exposed in bandwidth metrics');

  // Test 2: Lightweight Group Payload vs Full Detail
  console.log('\n--- Test 2: Lightweight Group Serialization ---');
  const summaryGroups = db.getConnectedGroups(undefined, false, false);
  const fullGroups = db.getConnectedGroups(undefined, false, true);

  const summaryJson = JSON.stringify(summaryGroups);
  const fullJson = JSON.stringify(fullGroups);

  console.log(`Summary Groups JSON size: ${(summaryJson.length / 1024).toFixed(1)} KB`);
  console.log(`Full Groups JSON size: ${(fullJson.length / 1024).toFixed(1)} KB`);

  assert(summaryGroups.length === fullGroups.length, 'Same group count returned in summary and full modes');
  assert(summaryJson.length < fullJson.length, 'Summary groups JSON is smaller than full groups JSON');
  assert(summaryJson.length < 250 * 1024, 'Summary groups payload is under 250 KB');

  // Test 3: Gzip Compression Efficiency on JSON
  console.log('\n--- Test 3: Gzip Compression Efficiency ---');
  const gzippedSummary = zlib.gzipSync(Buffer.from(summaryJson));
  const compressionRatio = (1 - gzippedSummary.length / summaryJson.length) * 100;
  console.log(`Summary JSON gzipped size: ${(gzippedSummary.length / 1024).toFixed(1)} KB (${compressionRatio.toFixed(1)}% reduction)`);
  assert(compressionRatio > 85, 'Gzip reduces summary groups payload size by > 85%');

  const uncompressed = zlib.gunzipSync(gzippedSummary).toString('utf8');
  assert(uncompressed === summaryJson, 'Decompressed payload matches original payload byte-for-byte');

  // Test 4: Live HTTP Server Compression & ETag 304 Handling
  console.log('\n--- Test 4: Live HTTP Server Compression & Conditional ETag 304 ---');
  process.env.PORT = '3999';
  process.env.ROXIE_TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  const { startServer } = await import('../server.js');
  const server = await startServer();
  const port = 3999;
  if (!server.listening) {
    await new Promise<void>((resolve) => server.once('listening', resolve));
  }

  // Request 1: GET /api/dashboard/overview with gzip
  const res1 = await new Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/dashboard/overview',
        method: 'GET',
        headers: { 'Accept-Encoding': 'gzip' }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
      }
    );
    req.on('error', reject);
    req.end();
  });

  assert(res1.statusCode === 200, 'HTTP 200 for initial overview request');
  const etag = res1.headers['etag'];
  assert(Boolean(etag), 'Overview response includes ETag header');

  // Request 2: Conditional GET with If-None-Match
  const res2 = await new Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/dashboard/overview',
        method: 'GET',
        headers: {
          'Accept-Encoding': 'gzip',
          'If-None-Match': etag as string
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
      }
    );
    req.on('error', reject);
    req.end();
  });

  assert(res2.statusCode === 304, 'HTTP 304 Not Modified returned for unchanged overview ETag');
  assert(res2.body.length === 0, 'Zero body bytes transferred on 304 Not Modified response');

  // Test 5: /api/dashboard/groups query parameter support
  console.log('\n--- Test 5: /api/dashboard/groups Default Summary vs Full Query Param ---');
  const resGroupsSummary = await new Promise<{ body: Buffer }>((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: '/api/dashboard/groups', headers: { 'Accept-Encoding': 'identity' } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });

  const resGroupsFull = await new Promise<{ body: Buffer }>((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: '/api/dashboard/groups?full=true', headers: { 'Accept-Encoding': 'identity' } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });

  console.log(`API Groups default: ${(resGroupsSummary.body.length / 1024).toFixed(1)} KB`);
  console.log(`API Groups full=true: ${(resGroupsFull.body.length / 1024).toFixed(1)} KB`);
  assert(resGroupsSummary.body.length < resGroupsFull.body.length, 'Default API groups response is smaller than full=true response');

  // Test 6: Static Asset Caching Headers
  console.log('\n--- Test 6: Static Asset Cache-Control Headers ---');
  const resStatic = await new Promise<{ headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: '/assets/icons-B1gxXj75.js' }, (res) => {
      res.resume();
      resolve({ headers: res.headers });
    }).on('error', reject);
  });

  const cacheControl = resStatic.headers['cache-control'] || '';
  console.log(`Static asset Cache-Control: ${cacheControl}`);
  assert(cacheControl.includes('immutable') && cacheControl.includes('max-age=31536000'), 'Fingerprinted static assets receive immutable max-age 1yr cache header');

  // Test 7: Bandwidth Metrics Endpoint
  console.log('\n--- Test 7: Bandwidth Metrics Endpoint ---');
  const resMetrics = await new Promise<{ body: string }>((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: '/api/dashboard/bandwidth-metrics' }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });

  const metricsData = JSON.parse(resMetrics.body);
  assert(metricsData.totals && typeof metricsData.totals.totalOutboundBytes === 'number', 'Bandwidth metrics endpoint returns valid aggregated totals');
  assert(metricsData.topRoutesByBandwidth && Array.isArray(metricsData.topRoutesByBandwidth), 'Top routes array present in bandwidth metrics');

  // Close server cleanly
  await new Promise<void>((resolve) => server.close(() => resolve()));

  console.log('\n======================================================');
  console.log(`🎉 All ${passedTests}/${totalTests} Bandwidth Optimization tests passed!`);
  console.log('======================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ Unhandled test failure:', err);
  process.exit(1);
});
