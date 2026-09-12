import { mongoManager } from './mongodb.js';

export interface MongoGroupDocument {
  chatId: string; // Stored as normalized string e.g. "-1004331070653"
  numChatId: number;
  title: string;
  type?: string;
  username?: string | null;
  schemaVersion: number;
  status: {
    botLeft?: boolean;
    leftAt?: string | null;
    unavailable?: boolean;
    unavailableAt?: string | null;
    unavailableReason?: string | null;
  };
  settings: Record<string, any>;
  permissions?: Record<string, any>;
  moderation?: Record<string, any>;
  ai?: Record<string, any>;
  lustMode?: Record<string, any>;
  autoResponse?: Record<string, any>;
  autoSticker?: Record<string, any>;
  stickers?: Record<string, any>;
  stickerPacks?: any[];
  abuseWords?: string[];
  members?: any[];
  moderators?: any[];
  messages?: any[];
  warnings?: any[];
  schedules?: any[];
  createdAt: Date;
  updatedAt: Date;
}

export class MongoStorageService {
  private static indexEnsured: boolean = false;

  public static async ensureIndexes(): Promise<boolean> {
    if (this.indexEnsured) return true;
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return false;

      await collection.createIndex({ chatId: 1 }, { unique: true });
      await collection.createIndex({ numChatId: 1 });
      this.indexEnsured = true;
      return true;
    } catch (err: any) {
      console.warn(`[MongoStorage] Index creation error: ${err?.message}`);
      return false;
    }
  }

  public static async getGroup(chatId: string | number): Promise<MongoGroupDocument | null> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return null;

      const normChatId = String(chatId);
      const numChatId = Number(chatId);

      const doc = await collection.findOne({
        $or: [{ chatId: normChatId }, { numChatId }]
      });

      return doc;
    } catch (err: any) {
      console.warn(`[MongoStorage] Failed to get group ${chatId}: ${err?.message}`);
      return null;
    }
  }

  public static async saveGroup(groupData: any): Promise<boolean> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return false;

      await this.ensureIndexes();

      const rawChatId = groupData.chat?.chatId || groupData.chatId || groupData.settings?.chatId;
      if (!rawChatId) return false;

      const normChatId = String(rawChatId);
      const numChatId = Number(rawChatId);
      const title = groupData.chat?.title || groupData.settings?.chatTitle || groupData.title || 'Group';

      const now = new Date();

      const doc: Partial<MongoGroupDocument> = {
        chatId: normChatId,
        numChatId,
        title,
        type: groupData.chat?.type || 'supergroup',
        username: groupData.chat?.username || null,
        schemaVersion: groupData.schemaVersion || 1,
        status: groupData.status || {},
        settings: groupData.settings || {},
        permissions: groupData.permissions || {},
        moderation: groupData.moderation || {},
        ai: groupData.ai || {},
        lustMode: groupData.lustMode || {},
        autoResponse: groupData.autoResponse || groupData.settings?.autoResponse || {},
        autoSticker: groupData.autoSticker || groupData.settings?.autoSticker || {},
        stickers: groupData.stickers || {},
        stickerPacks: (groupData.stickerPacks || []).slice(0, 100),
        abuseWords: (groupData.abuseWords || []).slice(0, 500),
        members: (groupData.members || []).slice(0, 500),
        moderators: (groupData.moderators || []).slice(0, 100),
        messages: (groupData.messages || []).slice(-500),
        schedules: (groupData.schedules || groupData.statistics?.schedules || []).slice(-50),
        updatedAt: now
      };

      await collection.updateOne(
        { chatId: normChatId },
        {
          $set: doc,
          $setOnInsert: { createdAt: now }
        },
        { upsert: true }
      );

      return true;
    } catch (err: any) {
      console.error(`[MongoStorage] Failed to save group ${groupData?.chatId || groupData?.settings?.chatId}: ${err?.message}`);
      return false;
    }
  }

  public static async getAllGroups(): Promise<MongoGroupDocument[]> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return [];

      return await collection.find({}).toArray();
    } catch (err: any) {
      console.warn(`[MongoStorage] Failed to get all groups: ${err?.message}`);
      return [];
    }
  }

  public static async countGroups(): Promise<number> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return 0;
      return await collection.countDocuments({});
    } catch {
      return 0;
    }
  }
}
