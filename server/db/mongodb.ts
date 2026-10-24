import { MongoClient, Db, Collection } from 'mongodb';

export interface MongoConfig {
  uri?: string;
  dbName: string;
  maxPoolSize: number;
  minPoolSize: number;
  serverSelectionTimeoutMS: number;
  connectTimeoutMS: number;
}

export interface MongoStatus {
  isConfigured: boolean;
  isConnected: boolean;
  dbName: string;
  lastError: string | null;
  lastConnectedAt: string | null;
}

class MongoManager {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private isConnecting: boolean = false;
  private isConnected: boolean = false;
  private lastError: string | null = null;
  private lastConnectedAt: string | null = null;

  public getConfig(): MongoConfig {
    const uri = process.env.MONGODB_URI?.trim();
    const dbName = process.env.MONGODB_DB_NAME?.trim() || 'roxie';
    const maxPoolSize = parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10', 10);
    const minPoolSize = parseInt(process.env.MONGODB_MIN_POOL_SIZE || '0', 10);
    const serverSelectionTimeoutMS = parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '5000', 10);
    const connectTimeoutMS = parseInt(process.env.MONGODB_CONNECT_TIMEOUT_MS || '5000', 10);

    return {
      uri,
      dbName,
      maxPoolSize: isNaN(maxPoolSize) ? 10 : maxPoolSize,
      minPoolSize: isNaN(minPoolSize) ? 0 : minPoolSize,
      serverSelectionTimeoutMS: isNaN(serverSelectionTimeoutMS) ? 5000 : serverSelectionTimeoutMS,
      connectTimeoutMS: isNaN(connectTimeoutMS) ? 5000 : connectTimeoutMS
    };
  }

  public getStatus(): MongoStatus {
    const config = this.getConfig();
    return {
      isConfigured: Boolean(config.uri && config.uri.length > 0),
      isConnected: this.isConnected,
      dbName: config.dbName,
      lastError: this.lastError,
      lastConnectedAt: this.lastConnectedAt
    };
  }

  public async connect(): Promise<Db | null> {
    const config = this.getConfig();
    if (!config.uri) {
      this.isConnected = false;
      return null;
    }

    if (this.isConnected && this.db && this.client) {
      return this.db;
    }

    if (this.isConnecting) {
      // Wait for existing connection attempt
      let attempts = 0;
      while (this.isConnecting && attempts < 20) {
        await new Promise(r => setTimeout(r, 200));
        attempts++;
      }
      if (this.isConnected && this.db) return this.db;
    }

    this.isConnecting = true;
    try {
      this.client = new MongoClient(config.uri, {
        maxPoolSize: config.maxPoolSize,
        minPoolSize: config.minPoolSize,
        serverSelectionTimeoutMS: config.serverSelectionTimeoutMS,
        connectTimeoutMS: config.connectTimeoutMS,
        retryWrites: true
      });

      await this.client.connect();
      this.db = this.client.db(config.dbName);
      this.isConnected = true;
      this.lastError = null;
      this.lastConnectedAt = new Date().toISOString();

      console.log(`[MongoDB] Successfully connected to MongoDB Atlas database "${config.dbName}"`);
      return this.db;
    } catch (err: any) {
      this.isConnected = false;
      this.db = null;
      this.lastError = err?.message || 'MongoDB connection failed';
      console.error(`[MongoDB] Connection error: ${this.lastError}`);
      return null;
    } finally {
      this.isConnecting = false;
    }
  }

  public getDb(): Db | null {
    return this.db;
  }

  public getGroupsCollection<T = any>(): Collection<T> | null {
    if (!this.db || !this.isConnected) return null;
    return this.db.collection<T>('groups');
  }

  public getPrivateRecipientsCollection<T = any>(): Collection<T> | null {
    if (!this.db || !this.isConnected) return null;
    return this.db.collection<T>('private_recipients');
  }

  public getPrivateChatsCollection<T = any>(): Collection<T> | null {
    if (!this.db || !this.isConnected) return null;
    return this.db.collection<T>('private_chats');
  }

  public async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (err: any) {
        console.warn(`[MongoDB] Error during close: ${err?.message}`);
      }
      this.client = null;
      this.db = null;
      this.isConnected = false;
    }
  }
}

export const mongoManager = new MongoManager();
