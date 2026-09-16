import { mongoManager } from './mongodb.js';

export interface MongoGroupDocument {
  botId?: number;
  botUsername?: string | null;
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

      // 1. Inspect existing indexes and document statistics safely
      const existingIndexes = await collection.indexes().catch(() => []);
      const indexNames = existingIndexes.map(i => i.name || JSON.stringify(i.key));
      console.log(`[MongoStorage] Current indexes on groups collection: ${indexNames.join(', ')}`);

      try {
        const totalDocs = await collection.countDocuments({});
        const docsWithBotId = await collection.countDocuments({ botId: { $exists: true, $ne: null } });
        const docsWithoutBotId = totalDocs - docsWithBotId;
        console.log(`[MongoStorage] Group collection inventory: ${totalDocs} total docs (${docsWithBotId} with botId, ${docsWithoutBotId} legacy without botId).`);
      } catch {}

      // 2. Create compound unique index { botId: 1, chatId: 1 } if not already present
      const hasCompoundUnique = existingIndexes.some(
        idx => idx.key && idx.key.botId === 1 && idx.key.chatId === 1 && idx.unique === true
      );

      if (!hasCompoundUnique) {
        await collection.createIndex({ botId: 1, chatId: 1 }, { unique: true, name: 'botId_1_chatId_1' });
        console.log('[MongoStorage] Created compound unique index: { botId: 1, chatId: 1 }');
      }

      // 3. Create helper non-unique index { botId: 1 } for bot-scoped queries
      const hasBotIdIndex = existingIndexes.some(
        idx => idx.key && idx.key.botId === 1 && !idx.key.chatId
      );
      if (!hasBotIdIndex) {
        await collection.createIndex({ botId: 1 }, { name: 'botId_1' });
      }

      // 4. Safely inspect single-field unique index on chatId
      const legacyUniqueChatIdIndex = existingIndexes.find(
        idx => idx.key && idx.key.chatId === 1 && !idx.key.botId && idx.unique === true
      );

      if (legacyUniqueChatIdIndex) {
        // Safe replacement: Only replace the single-field UNIQUE index AFTER compound unique index is active,
        // and create non-unique chatId_1 index so multi-bot coexistence is supported with ZERO data loss.
        const legacyName = legacyUniqueChatIdIndex.name || 'chatId_1';
        try {
          await collection.dropIndex(legacyName);
          console.log(`[MongoStorage] Safely dropped legacy single-field unique index "${legacyName}" in favor of compound { botId, chatId } uniqueness.`);
        } catch (dropErr: any) {
          console.warn(`[MongoStorage] Notice when dropping legacy index ${legacyName}: ${dropErr?.message}`);
        }
      }

      // Ensure non-unique chatId_1 index exists for fast lookups
      const hasChatIdIndex = existingIndexes.some(
        idx => idx.key && idx.key.chatId === 1 && !idx.key.botId
      );
      if (!hasChatIdIndex || legacyUniqueChatIdIndex) {
        await collection.createIndex({ chatId: 1 }, { name: 'chatId_1' }).catch(() => {});
      }

      await collection.createIndex({ numChatId: 1 }).catch(() => {});

      this.indexEnsured = true;
      return true;
    } catch (err: any) {
      console.warn(`[MongoStorage] Index creation error: ${err?.message}`);
      return false;
    }
  }

  public static async getGroup(chatId: string | number, botId?: number): Promise<MongoGroupDocument | null> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return null;

      const normChatId = String(chatId);
      const numChatId = Number(chatId);

      const query: any = {
        $or: [{ chatId: normChatId }, { numChatId }]
      };
      if (botId !== undefined && botId !== null) {
        query.botId = botId;
      }

      const doc = await collection.findOne(query);
      return doc;
    } catch (err: any) {
      console.warn(`[MongoStorage] Failed to get group ${chatId}: ${err?.message}`);
      return null;
    }
  }

  public static async saveGroup(groupData: any, targetBotId?: number, targetBotUsername?: string): Promise<boolean> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return false;

      await this.ensureIndexes();

      const rawChatId = groupData.chat?.chatId || groupData.chatId || groupData.settings?.chatId;
      if (!rawChatId) return false;

      const normChatId = String(rawChatId);
      const numChatId = Number(rawChatId);
      const title = groupData.chat?.title || groupData.settings?.chatTitle || groupData.title || 'Group';

      const botId = targetBotId !== undefined
        ? targetBotId
        : (groupData.botId !== undefined ? groupData.botId : groupData.settings?.botId);

      const botUsername = targetBotUsername !== undefined
        ? targetBotUsername
        : (groupData.botUsername || groupData.settings?.botUsername || null);

      const now = new Date();

      const doc: Partial<MongoGroupDocument> = {
        botId,
        botUsername,
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

      const filter: any = { chatId: normChatId };
      if (botId !== undefined && botId !== null) {
        filter.botId = botId;
      }

      await collection.updateOne(
        filter,
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

  public static async getAllGroups(botId?: number): Promise<MongoGroupDocument[]> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return [];

      const query: any = botId !== undefined && botId !== null ? { botId } : {};
      return await collection.find(query).toArray();
    } catch (err: any) {
      console.warn(`[MongoStorage] Failed to get all groups: ${err?.message}`);
      return [];
    }
  }

  public static async countGroups(botId?: number): Promise<number> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return 0;
      const query: any = botId !== undefined && botId !== null ? { botId } : {};
      return await collection.countDocuments(query);
    } catch {
      return 0;
    }
  }
}
