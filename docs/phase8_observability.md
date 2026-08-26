# Roxie Telegram Bot — Phase 8: Observability & Telemetry

## Observability Stack
1. **System Health API (`/api/system/health`)**: Provides instantaneous insight into system status, memory allocation, Telegram connection, and active operators.
2. **System Metrics API (`/api/system/metrics`)**: Exposes operational counters across multiple time windows (current, hour, 24h, 7d).
3. **Unified Event Timeline (`/api/system/timeline`)**: Combines moderation logs, errors, authentication events, and backups into a single chronological stream.
4. **Terminal Log Console**: Interactive frontend log console providing real-time filtering, search, severity badges, and auto-scroll capabilities.
