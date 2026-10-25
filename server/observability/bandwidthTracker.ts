/**
 * BandwidthTrackerService
 *
 * Lightweight, in-memory telemetry service for tracking Render outbound bandwidth.
 * Aggregates:
 * - Request counts and response bytes by API route.
 * - Largest observed response payloads.
 * - Outbound external HTTP request counts and bytes (e.g. Telegram API).
 * - MongoDB operation counts.
 * - 304 Not Modified cache hits.
 *
 * Strict Privacy & Safety:
 * Never logs request bodies, bot tokens, auth credentials, user messages, or private data.
 */

export interface RouteBandwidthStat {
  route: string;
  requests: number;
  totalOutboundBytes: number;
  cached304Count: number;
  minBytes: number;
  maxBytes: number;
  avgBytes: number;
  lastRequestedAt: string;
}

export interface LargestPayloadEntry {
  route: string;
  bytes: number;
  statusCode: number;
  timestamp: string;
}

export interface ExternalDestinationStat {
  destination: string;
  calls: number;
  estimatedOutboundBytes: number;
  estimatedInboundBytes: number;
  lastCallAt: string;
}

export interface BandwidthSummary {
  trackingUptimeSeconds: number;
  totals: {
    totalRequests: number;
    totalOutboundBytes: number;
    totalOutboundFormatted: string;
    totalInboundBytes: number;
    totalInboundFormatted: string;
    cached304Responses: number;
    compressionSavingsBytes: number;
    compressionSavingsFormatted: string;
    projectedDailyOutboundBytes: number;
    projectedDailyOutboundFormatted: string;
  };
  topRoutesByBandwidth: RouteBandwidthStat[];
  largestPayloadsObserved: LargestPayloadEntry[];
  externalTraffic: ExternalDestinationStat[];
  mongoDbOperations: Record<string, number>;
}

class BandwidthTrackerService {
  private startTime: number = Date.now();
  private totalRequests: number = 0;
  private totalOutboundBytes: number = 0;
  private totalInboundBytes: number = 0;
  private total304Count: number = 0;
  private compressionSavingsBytes: number = 0;

  private routeStatsMap: Map<string, {
    requests: number;
    totalOutboundBytes: number;
    cached304Count: number;
    minBytes: number;
    maxBytes: number;
    lastRequestedAt: string;
  }> = new Map();

  private largestPayloads: LargestPayloadEntry[] = [];
  private externalDestinationsMap: Map<string, ExternalDestinationStat> = new Map();
  private mongoOperations: Record<string, number> = {};

  /**
   * Record an HTTP response sent to a client
   */
  public recordHttpResponse(
    route: string,
    statusCode: number,
    outboundBytes: number,
    inboundBytes: number = 0,
    is304: boolean = false,
    savedByCompression: number = 0
  ): void {
    this.totalRequests++;
    this.totalOutboundBytes += outboundBytes;
    this.totalInboundBytes += inboundBytes;
    this.compressionSavingsBytes += Math.max(0, savedByCompression);

    if (is304) {
      this.total304Count++;
    }

    // Normalize route pattern to aggregate dynamic parameters
    const normalizedRoute = this.normalizeRoute(route);

    let stat = this.routeStatsMap.get(normalizedRoute);
    if (!stat) {
      stat = {
        requests: 0,
        totalOutboundBytes: 0,
        cached304Count: 0,
        minBytes: outboundBytes,
        maxBytes: outboundBytes,
        lastRequestedAt: new Date().toISOString()
      };
      this.routeStatsMap.set(normalizedRoute, stat);
    }

    stat.requests++;
    stat.totalOutboundBytes += outboundBytes;
    if (is304) stat.cached304Count++;
    if (outboundBytes < stat.minBytes) stat.minBytes = outboundBytes;
    if (outboundBytes > stat.maxBytes) stat.maxBytes = outboundBytes;
    stat.lastRequestedAt = new Date().toISOString();

    // Track largest payloads (keep top 10)
    if (outboundBytes > 1024) {
      this.largestPayloads.push({
        route: normalizedRoute,
        bytes: outboundBytes,
        statusCode,
        timestamp: new Date().toISOString()
      });
      this.largestPayloads.sort((a, b) => b.bytes - a.bytes);
      if (this.largestPayloads.length > 10) {
        this.largestPayloads.length = 10;
      }
    }
  }

  /**
   * Record an external HTTP call (e.g. Telegram API)
   */
  public recordExternalCall(destination: string, outboundBytes: number, inboundBytes: number = 0): void {
    let stat = this.externalDestinationsMap.get(destination);
    if (!stat) {
      stat = {
        destination,
        calls: 0,
        estimatedOutboundBytes: 0,
        estimatedInboundBytes: 0,
        lastCallAt: new Date().toISOString()
      };
      this.externalDestinationsMap.set(destination, stat);
    }
    stat.calls++;
    stat.estimatedOutboundBytes += outboundBytes;
    stat.estimatedInboundBytes += inboundBytes;
    stat.lastCallAt = new Date().toISOString();
  }

  /**
   * Record a MongoDB operation
   */
  public recordMongoOp(op: string): void {
    this.mongoOperations[op] = (this.mongoOperations[op] || 0) + 1;
  }

  /**
   * Get formatted metrics summary
   */
  public getSummary(): BandwidthSummary {
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
    const projectedDailyOutboundBytes = Math.round((this.totalOutboundBytes / elapsedSeconds) * 86400);

    const routes: RouteBandwidthStat[] = Array.from(this.routeStatsMap.entries())
      .map(([route, s]) => ({
        route,
        requests: s.requests,
        totalOutboundBytes: s.totalOutboundBytes,
        cached304Count: s.cached304Count,
        minBytes: s.minBytes,
        maxBytes: s.maxBytes,
        avgBytes: s.requests > 0 ? Math.round(s.totalOutboundBytes / s.requests) : 0,
        lastRequestedAt: s.lastRequestedAt
      }))
      .sort((a, b) => b.totalOutboundBytes - a.totalOutboundBytes);

    return {
      trackingUptimeSeconds: elapsedSeconds,
      totals: {
        totalRequests: this.totalRequests,
        totalOutboundBytes: this.totalOutboundBytes,
        totalOutboundFormatted: this.formatBytes(this.totalOutboundBytes),
        totalInboundBytes: this.totalInboundBytes,
        totalInboundFormatted: this.formatBytes(this.totalInboundBytes),
        cached304Responses: this.total304Count,
        compressionSavingsBytes: this.compressionSavingsBytes,
        compressionSavingsFormatted: this.formatBytes(this.compressionSavingsBytes),
        projectedDailyOutboundBytes,
        projectedDailyOutboundFormatted: this.formatBytes(projectedDailyOutboundBytes)
      },
      topRoutesByBandwidth: routes.slice(0, 15),
      largestPayloadsObserved: this.largestPayloads,
      externalTraffic: Array.from(this.externalDestinationsMap.values()),
      mongoDbOperations: this.mongoOperations
    };
  }

  /**
   * Reset metrics (useful for testing)
   */
  public reset(): void {
    this.startTime = Date.now();
    this.totalRequests = 0;
    this.totalOutboundBytes = 0;
    this.totalInboundBytes = 0;
    this.total304Count = 0;
    this.compressionSavingsBytes = 0;
    this.routeStatsMap.clear();
    this.largestPayloads = [];
    this.externalDestinationsMap.clear();
    this.mongoOperations = {};
  }

  private normalizeRoute(route: string): string {
    return route
      .split('?')[0]
      .replace(/\/groups\/-?\d+/g, '/groups/:chatId')
      .replace(/\/private-chats\/\d+/g, '/private-chats/:userId')
      .replace(/\/posts\/[A-Za-z0-9_-]+/g, '/posts/:id')
      .replace(/\/assets\/[A-Za-z0-9_.-]+/g, '/assets/:asset');
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

export const bandwidthTracker = new BandwidthTrackerService();
