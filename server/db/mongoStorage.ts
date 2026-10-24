import { mongoManager } from './mongodb.js';

export interface MongoPrivateRecipientDocument {
  botId?: number;
  chatId: string; // Stored as normalized string e.g. "12345678"
  numChatId: number;
  username?: string;
  firstName?: string;
  displayName?: string;
  source?: 'welcome_dm' | 'private_interaction' | 'deep_link';
  sourceGroupId?: number;
  status: 'active' | 'blocked' | 'opted_out' | 'failed';
  failureReason?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastDeliveredAt?: string;
  deliveryCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MongoPrivateChatDocument {
  botId?: number;
  chatId: string;
  numChatId: number;
  userId: number;
  username?: string;
  name?: string;
  language?: string;
  lastUpdated: number;
  messages: any[];
  createdAt: Date;
  updatedAt: Date;
}

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

      // Ensure indexes on private_recipients collection
      try {
        const recipientsCol = mongoManager.getPrivateRecipientsCollection<MongoPrivateRecipientDocument>();
        if (recipientsCol) {
          const recIndexes = await recipientsCol.indexes().catch(() => []);
          const hasRecCompound = recIndexes.some(
            idx => idx.key && idx.key.botId === 1 && idx.key.chatId === 1 && idx.unique === true
          );
          if (!hasRecCompound) {
            await recipientsCol.createIndex({ botId: 1, chatId: 1 }, { unique: true, name: 'botId_1_chatId_1' }).catch(() => {});
          }
          await recipientsCol.createIndex({ chatId: 1 }, { name: 'chatId_1' }).catch(() => {});
          await recipientsCol.createIndex({ numChatId: 1 }, { name: 'numChatId_1' }).catch(() => {});
        }
      } catch (recIdxErr: any) {
        console.warn(`[MongoStorage] Private recipients index warning: ${recIdxErr?.message}`);
      }

      // Ensure indexes on private_chats collection
      try {
        const chatsCol = mongoManager.getPrivateChatsCollection<MongoPrivateChatDocument>();
        if (chatsCol) {
          const chatIndexes = await chatsCol.indexes().catch(() => []);
          const hasChatCompound = chatIndexes.some(
            idx => idx.key && idx.key.botId === 1 && idx.key.chatId === 1 && idx.unique === true
          );
          if (!hasChatCompound) {
            await chatsCol.createIndex({ botId: 1, chatId: 1 }, { unique: true, name: 'botId_1_chatId_1' }).catch(() => {});
          }
          await chatsCol.createIndex({ chatId: 1 }, { name: 'chatId_1' }).catch(() => {});
          await chatsCol.createIndex({ numChatId: 1 }, { name: 'numChatId_1' }).catch(() => {});
        }
      } catch (chatIdxErr: any) {
        console.warn(`[MongoStorage] Private chats index warning: ${chatIdxErr?.message}`);
      }

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
        members: (groupData.members || []).slice(0, 10000),
        moderators: (groupData.moderators || []).slice(0, 100),
        messages: (groupData.messages || []).slice(-500),
        schedules: (groupData.schedules || groupData.statistics?.schedules || []).slice(-50),
        updatedAt: now
      };

      const filter: any = {
        $or: [{ chatId: normChatId }, { numChatId }]
      };
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

  public static async appendGroupMessage(chatId: string | number, message: any, targetBotId?: number, incrementHumanCounter: boolean = false): Promise<boolean> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return false;

      const normChatId = String(chatId);
      const numChatId = Number(chatId);
      const now = new Date();

      const filter: any = {
        $or: [{ chatId: normChatId }, { numChatId }]
      };
      if (targetBotId !== undefined && targetBotId !== null) {
        filter.botId = targetBotId;
      }

      const cleanMsg = JSON.parse(JSON.stringify(message));

      const updateDoc: any = {
        $push: {
          messages: {
            $each: [cleanMsg],
            $slice: -500
          }
        },
        $set: { updatedAt: now }
      };

      if (incrementHumanCounter) {
        updateDoc.$inc = {
          "settings.humanMessagesSinceLastSticker": 1,
          "autoEngine.humanMessagesSinceLastSticker": 1
        };
      }

      const res = await collection.updateOne(filter, updateDoc);
      if (res.matchedCount === 0) {
        console.warn(`[MongoStorage] Group ${chatId} not found in MongoDB for message append (matchedCount: 0)`);
        return false;
      }

      return true;
    } catch (err: any) {
      console.error(`[MongoStorage] Failed to append message to group ${chatId}: ${err?.message}`);
      return false;
    }
  }

  public static async incrementHumanMessageCount(chatId: string | number, targetBotId?: number): Promise<boolean> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return false;

      const normChatId = String(chatId);
      const numChatId = Number(chatId);
      const now = new Date();

      const filter: any = {
        $or: [{ chatId: normChatId }, { numChatId }]
      };
      if (targetBotId !== undefined && targetBotId !== null) {
        filter.botId = targetBotId;
      }

      const res = await collection.updateOne(
        filter,
        {
          $inc: {
            "settings.humanMessagesSinceLastSticker": 1,
            "autoEngine.humanMessagesSinceLastSticker": 1
          },
          $set: { updatedAt: now }
        }
      );

      if (res.matchedCount === 0) {
        console.warn(`[MongoStorage] Group ${chatId} not found in MongoDB for counter increment (matchedCount: 0)`);
        return false;
      }

      return true;
    } catch (err: any) {
      console.error(`[MongoStorage] Failed to increment human message count for group ${chatId}: ${err?.message}`);
      return false;
    }
  }

  public static async updateStickerActivity(chatId: string | number, newGap: number, targetBotId?: number): Promise<boolean> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return false;

      const normChatId = String(chatId);
      const numChatId = Number(chatId);
      const now = new Date();

      const filter: any = {
        $or: [{ chatId: normChatId }, { numChatId }]
      };
      if (targetBotId !== undefined && targetBotId !== null) {
        filter.botId = targetBotId;
      }

      const res = await collection.updateOne(
        filter,
        {
          $set: {
            "settings.humanMessagesSinceLastSticker": 0,
            "settings.requiredStickerGap": newGap,
            "autoEngine.humanMessagesSinceLastSticker": 0,
            "autoEngine.requiredStickerGap": newGap,
            updatedAt: now
          }
        }
      );

      if (res.matchedCount === 0) {
        console.warn(`[MongoStorage] Group ${chatId} not found in MongoDB for sticker activity update (matchedCount: 0)`);
        return false;
      }

      return true;
    } catch (err: any) {
      console.error(`[MongoStorage] Failed to update sticker activity for group ${chatId}: ${err?.message}`);
      return false;
    }
  }

  public static async recordAutoStickerSent(chatId: string | number, newGap: number, targetBotId?: number): Promise<boolean> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return false;

      const normChatId = String(chatId);
      const numChatId = Number(chatId);
      const now = new Date();
      const nowMs = now.getTime();

      const filter: any = {
        $or: [{ chatId: normChatId }, { numChatId }]
      };
      if (targetBotId !== undefined && targetBotId !== null) {
        filter.botId = targetBotId;
      }

      const res = await collection.updateOne(
        filter,
        {
          $set: {
            "settings.lastStickerTimestamp": nowMs,
            "settings.lastSentTimestamp": nowMs,
            "settings.humanMessagesSinceLastSticker": 0,
            "settings.requiredStickerGap": newGap,
            "autoEngine.lastStickerTimestamp": nowMs,
            "autoEngine.lastSentTimestamp": nowMs,
            "autoEngine.humanMessagesSinceLastSticker": 0,
            "autoEngine.requiredStickerGap": newGap,
            "autoEngine.stickers.lastSentTimestamp": nowMs,
            "autoSticker.lastSentTimestamp": nowMs,
            updatedAt: now
          }
        }
      );

      if (res.matchedCount === 0) {
        console.warn(`[MongoStorage] Group ${chatId} not found in MongoDB for auto sticker update (matchedCount: 0)`);
        return false;
      }

      return true;
    } catch (err: any) {
      console.error(`[MongoStorage] Failed to record auto sticker sent for group ${chatId}: ${err?.message}`);
      return false;
    }
  }

  public static async setLastProactiveConsideredMessageId(chatId: string | number, messageId: number, targetBotId?: number): Promise<boolean> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return false;

      const normChatId = String(chatId);
      const numChatId = Number(chatId);
      const now = new Date();

      const filter: any = {
        $or: [{ chatId: normChatId }, { numChatId }]
      };
      if (targetBotId !== undefined && targetBotId !== null) {
        filter.botId = targetBotId;
      }

      const res = await collection.updateOne(
        filter,
        {
          $set: {
            "settings.lastProactiveConsideredMessageId": messageId,
            updatedAt: now
          }
        }
      );

      if (res.matchedCount === 0) {
        console.warn(`[MongoStorage] Group ${chatId} not found in MongoDB for proactive state update (matchedCount: 0)`);
        return false;
      }

      return true;
    } catch (err: any) {
      console.error(`[MongoStorage] Failed to set last proactive considered message ID for group ${chatId}: ${err?.message}`);
      return false;
    }
  }

  public static async recordAutoResponseSent(chatId: string | number, targetBotId?: number): Promise<boolean> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return false;

      const normChatId = String(chatId);
      const numChatId = Number(chatId);
      const now = new Date();
      const nowMs = now.getTime();

      const filter: any = {
        $or: [{ chatId: normChatId }, { numChatId }]
      };
      if (targetBotId !== undefined && targetBotId !== null) {
        filter.botId = targetBotId;
      }

      const res = await collection.updateOne(
        filter,
        {
          $set: {
            "settings.lastResponseTimestamp": nowMs,
            "settings.lastSentTimestamp": nowMs,
            "autoEngine.lastMessageTimestamp": nowMs,
            "autoEngine.lastSentTimestamp": nowMs,
            "autoEngine.messages.lastSentTimestamp": nowMs,
            updatedAt: now
          }
        }
      );

      if (res.matchedCount === 0) {
        console.warn(`[MongoStorage] Group ${chatId} not found in MongoDB for auto response update (matchedCount: 0)`);
        return false;
      }

      return true;
    } catch (err: any) {
      console.error(`[MongoStorage] Failed to record auto response sent for group ${chatId}: ${err?.message}`);
      return false;
    }
  }

  public static async updateGroupSchedules(chatId: string | number, schedules: any[], targetBotId?: number): Promise<boolean> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return false;

      const normChatId = String(chatId);
      const numChatId = Number(chatId);
      const now = new Date();

      const filter: any = {
        $or: [{ chatId: normChatId }, { numChatId }]
      };
      if (targetBotId !== undefined && targetBotId !== null) {
        filter.botId = targetBotId;
      }

      const res = await collection.updateOne(
        filter,
        {
          $set: {
            schedules: (schedules || []).slice(-50),
            updatedAt: now
          }
        }
      );

      if (res.matchedCount === 0) {
        return false;
      }

      return true;
    } catch (err: any) {
      console.error(`[MongoStorage] Failed to update schedules for group ${chatId}: ${err?.message}`);
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

  public static async deleteGroup(chatId: string | number, botId?: number): Promise<boolean> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return false;

      const normChatId = String(chatId);
      const numChatId = Number(chatId);

      const query: any = {
        $or: [{ chatId: normChatId }, { numChatId }]
      };
      if (botId !== undefined && botId !== null) {
        query.botId = botId;
      }

      const result = await collection.deleteOne(query);
      return result.deletedCount > 0;
    } catch (err: any) {
      console.error(`[MongoStorage] Failed to delete group ${chatId} for botId ${botId}: ${err?.message}`);
      return false;
    }
  }

  public static async isMigrationApplied(migrationName: string): Promise<boolean> {
    try {
      const db = mongoManager.getDb();
      if (!db) return false;
      const collection = db.collection('migrations');
      const doc = await collection.findOne({ name: migrationName });
      return Boolean(doc);
    } catch (err: any) {
      console.warn(`[MongoStorage] Failed to check migration '${migrationName}' in MongoDB Atlas:`, err?.message);
      return false;
    }
  }

  public static async markMigrationApplied(migrationName: string): Promise<void> {
    try {
      const db = mongoManager.getDb();
      if (!db) return;
      const collection = db.collection('migrations');
      await collection.updateOne(
        { name: migrationName },
        { $set: { name: migrationName, appliedAt: new Date() } },
        { upsert: true }
      );
      console.log(`[MongoStorage] Migration '${migrationName}' marked as applied in MongoDB Atlas.`);
    } catch (err: any) {
      console.warn(`[MongoStorage] Failed to mark migration in MongoDB Atlas:`, err?.message);
    }
  }

  public static async purgeNonAuthoritativeGroups(allowedIds: Set<string>, allowedNumIds: Set<number>): Promise<number> {
    try {
      const collection = mongoManager.getGroupsCollection<MongoGroupDocument>();
      if (!collection) return 0;

      const allowedStrArray = Array.from(allowedIds);
      const allowedNumArray = Array.from(allowedNumIds);
      const combinedAllowed = [...allowedStrArray, ...allowedNumArray];

      // Pass 1: Bulk delete matching non-authoritative documents
      const deleteResult = await collection.deleteMany({
        $and: [
          { chatId: { $nin: allowedStrArray } },
          { numChatId: { $nin: allowedNumArray } }
        ] as any
      });

      // Pass 2: Exhaustive verification on all remaining documents
      const remainingDocs = await collection.find({}).toArray();
      let extraDeleted = 0;
      for (const doc of remainingDocs) {
        const rawId = String(doc.chatId || doc.numChatId || (doc as any).chat?.chatId || (doc as any).settings?.chatId || '');
        const numId = Number(rawId);
        const isAllowed = allowedIds.has(rawId) || (!isNaN(numId) && allowedNumIds.has(numId));
        if (!isAllowed) {
          await collection.deleteOne({ _id: (doc as any)._id });
          extraDeleted++;
        }
      }

      const totalDeleted = (deleteResult?.deletedCount || 0) + extraDeleted;
      console.log(`[MongoStorage] Purged ${totalDeleted} non-authoritative group documents from MongoDB Atlas.`);
      return totalDeleted;
    } catch (err: any) {
      console.error(`[MongoStorage] Failed to purge non-authoritative groups from MongoDB Atlas: ${err?.message}`);
      return 0;
    }
  }

  public static async savePrivateRecipient(recipientData: any, targetBotId?: number): Promise<boolean> {
    try {
      const collection = mongoManager.getPrivateRecipientsCollection<MongoPrivateRecipientDocument>();
      if (!collection) return false;

      const rawChatId = recipientData.chatId;
      if (!rawChatId) return false;

      const normChatId = String(rawChatId);
      const numChatId = Number(rawChatId);
      const botId = targetBotId !== undefined ? targetBotId : recipientData.botId;
      const now = new Date();

      const doc: Partial<MongoPrivateRecipientDocument> = {
        botId,
        chatId: normChatId,
        numChatId,
        username: recipientData.username,
        firstName: recipientData.firstName,
        displayName: recipientData.displayName,
        source: recipientData.source || 'private_interaction',
        sourceGroupId: recipientData.sourceGroupId,
        status: recipientData.status || 'active',
        failureReason: recipientData.failureReason,
        firstSeenAt: recipientData.firstSeenAt || now.toISOString(),
        lastSeenAt: recipientData.lastSeenAt || now.toISOString(),
        lastDeliveredAt: recipientData.lastDeliveredAt,
        deliveryCount: recipientData.deliveryCount ?? 0,
        updatedAt: now
      };

      const filter: any = {
        $or: [{ chatId: normChatId }, { numChatId }]
      };
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
      console.error(`[MongoStorage] Failed to save private recipient ${recipientData?.chatId}: ${err?.message}`);
      return false;
    }
  }

  public static async getAllPrivateRecipients(botId?: number): Promise<MongoPrivateRecipientDocument[]> {
    try {
      const collection = mongoManager.getPrivateRecipientsCollection<MongoPrivateRecipientDocument>();
      if (!collection) return [];

      const query: any = botId !== undefined && botId !== null ? { botId } : {};
      return await collection.find(query).toArray();
    } catch (err: any) {
      console.warn(`[MongoStorage] Failed to get all private recipients: ${err?.message}`);
      return [];
    }
  }

  public static async deletePrivateRecipient(chatId: string | number, botId?: number): Promise<boolean> {
    try {
      const collection = mongoManager.getPrivateRecipientsCollection<MongoPrivateRecipientDocument>();
      if (!collection) return false;

      const normChatId = String(chatId);
      const numChatId = Number(chatId);

      const query: any = {
        $or: [{ chatId: normChatId }, { numChatId }]
      };
      if (botId !== undefined && botId !== null) {
        query.botId = botId;
      }

      const result = await collection.deleteOne(query);
      return result.deletedCount > 0;
    } catch (err: any) {
      console.error(`[MongoStorage] Failed to delete private recipient ${chatId}: ${err?.message}`);
      return false;
    }
  }

  public static async savePrivateChat(chatData: any, targetBotId?: number): Promise<boolean> {
    try {
      const collection = mongoManager.getPrivateChatsCollection<MongoPrivateChatDocument>();
      if (!collection) return false;

      const rawChatId = chatData.chatId || chatData.userId;
      if (!rawChatId) return false;

      const normChatId = String(rawChatId);
      const numChatId = Number(rawChatId);
      const botId = targetBotId !== undefined ? targetBotId : chatData.botId;
      const now = new Date();

      const doc: Partial<MongoPrivateChatDocument> = {
        botId,
        chatId: normChatId,
        numChatId,
        userId: Number(chatData.userId || numChatId),
        username: chatData.username,
        name: chatData.name,
        language: chatData.language,
        lastUpdated: chatData.lastUpdated || Date.now(),
        messages: (chatData.messages || []).slice(-100),
        updatedAt: now
      };

      const filter: any = {
        $or: [{ chatId: normChatId }, { numChatId }]
      };
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
      console.error(`[MongoStorage] Failed to save private chat ${chatData?.chatId}: ${err?.message}`);
      return false;
    }
  }

  public static async getAllPrivateChats(botId?: number): Promise<MongoPrivateChatDocument[]> {
    try {
      const collection = mongoManager.getPrivateChatsCollection<MongoPrivateChatDocument>();
      if (!collection) return [];

      const query: any = botId !== undefined && botId !== null ? { botId } : {};
      return await collection.find(query).toArray();
    } catch (err: any) {
      console.warn(`[MongoStorage] Failed to get all private chats: ${err?.message}`);
      return [];
    }
  }
}
