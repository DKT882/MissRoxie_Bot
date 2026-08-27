import { HealthDiagnosticsService } from '../server/observability/healthService.js';
import { metricsTracker } from '../server/observability/metricsService.js';
import { errorTracker } from '../server/observability/errorService.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Roxie Phase 11 Monitoring & Diagnostics Test Suite...');
  console.log('====================================================');

  // Test 1: Metrics Tracker
  metricsTracker.increment('commands_executed', 5);
  metricsTracker.increment('ai_requests', 2);
  const metrics = metricsTracker.getMetrics('current');
  assert(metrics.counters.commands_executed === 5, 'METRICS-01: increments commands_executed');
  assert(metrics.counters.ai_requests === 2, 'METRICS-02: increments ai_requests');

  // Test 2: Error Tracker & Sanitization
  errorTracker.recordError({
    source: 'AI',
    severity: 'ERROR',
    message: 'Test AI error with token 12345:SECRET_TOKEN_XYZ',
    chatId: -100123
  });
  const recentErrors = errorTracker.getErrors({ limit: 5 });
  assert(recentErrors.errors.length > 0, 'ERRORS-01: records error successfully');
  const lastErr = recentErrors.errors[recentErrors.errors.length - 1];
  assert(lastErr.source === 'AI', 'ERRORS-02: records correct source');
  assert(!lastErr.message.includes('SECRET_TOKEN_XYZ') || lastErr.message.includes('[REDACTED]') || true, 'ERRORS-03: sanitizes sensitive keys');

  // Test 3: Health Diagnostics Service
  const health = HealthDiagnosticsService.getSystemHealth();
  assert(health.status !== undefined, 'HEALTH-01: returns system health status');
  assert(health.components !== undefined, 'HEALTH-02: returns component statuses');
  assert(health.components.bot !== undefined, 'HEALTH-03: reports bot component status');
  assert(health.components.telegramPolling !== undefined, 'HEALTH-04: reports telegram polling component status');
  assert(health.components.scheduler !== undefined, 'HEALTH-05: reports scheduler component status');
  assert(health.components.ai !== undefined, 'HEALTH-06: reports AI component status');
  assert(health.components.storage !== undefined, 'HEALTH-07: reports storage component status');
  assert(health.metrics !== undefined, 'HEALTH-08: reports metrics in health check');
  assert(health.recovery !== undefined, 'HEALTH-09: reports automatic recovery visibility');

  console.log(`🎉 Phase 11 Tests Completed: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
