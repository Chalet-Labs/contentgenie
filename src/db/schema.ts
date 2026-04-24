import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  serial,
  json,
  decimal,
  index,
  uniqueIndex,
  check,
  varchar,
  bigint,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { WorthItSignals } from "@/lib/openrouter";
import {
  DEFAULT_SUBSCRIPTION_SORT,
  SUBSCRIPTION_SORTS,
  type SubscriptionSort,
} from "@/db/subscription-sorts";

export { DEFAULT_SUBSCRIPTION_SORT, SUBSCRIPTION_SORTS, type SubscriptionSort };

// Rate limits table (managed by rate-limiter-flexible, see ADR-001).
// Defined here so drizzle-kit push doesn't try to drop it.
export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 255 }).primaryKey(),
  points: integer("points").notNull().default(0),
  expire: bigint("expire", { mode: "number" }),
});

// Users table (synced from Clerk)
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user ID
  email: text("email").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  preferences: json("preferences").$type<{
    notifications?: boolean;
    defaultView?: string;
    theme?: "light" | "dark" | "system";
    digestFrequency?: "realtime" | "daily" | "weekly";
    pushEnabled?: boolean;
    lastDigestSentAt?: string; // ISO 8601
    subscriptionSort?: SubscriptionSort;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Podcasts table
export const podcasts = pgTable(
  "podcasts",
  {
    id: serial("id").primaryKey(),
    podcastIndexId: text("podcast_index_id").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    publisher: text("publisher"),
    imageUrl: text("image_url"),
    rssFeedUrl: text("rss_feed_url"),
    categories: json("categories").$type<string[]>(),
    totalEpisodes: integer("total_episodes"),
    latestEpisodeDate: timestamp("latest_episode_date"),
    source: text("source")
      .$type<"podcastindex" | "rss">()
      .default("podcastindex")
      .notNull(),
    lastPolledAt: timestamp("last_polled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("podcasts_podcast_index_id_idx").on(table.podcastIndexId),
    check("source_enum", sql`${table.source} IN ('podcastindex', 'rss')`),
  ],
);

// Episodes table
export const episodes = pgTable(
  "episodes",
  {
    id: serial("id").primaryKey(),
    podcastId: integer("podcast_id")
      .references(() => podcasts.id, { onDelete: "cascade" })
      .notNull(),
    podcastIndexId: text("podcast_index_id").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    audioUrl: text("audio_url"),
    duration: integer("duration"), // in seconds
    publishDate: timestamp("publish_date"),
    transcription: text("transcription"),
    summary: text("summary"),
    keyTakeaways: json("key_takeaways").$type<string[]>(),
    worthItScore: decimal("worth_it_score", { precision: 4, scale: 2 }), // 0.00 - 10.00
    worthItReason: text("worth_it_reason"),
    worthItDimensions: json("worth_it_dimensions").$type<
      | {
          kind: "signals";
          signals: WorthItSignals;
          adjustment: -1 | 0 | 1;
          adjustmentReason: string;
        }
      | {
          kind: "dimensions";
          uniqueness: number;
          actionability: number;
          timeValue: number;
        }
    >(),
    processedAt: timestamp("processed_at"),
    summaryRunId: text("summary_run_id"),
    transcriptRunId: text("transcript_run_id"),
    summaryStatus: text("summary_status").$type<
      "queued" | "running" | "summarizing" | "completed" | "failed"
    >(),
    transcriptSource: text("transcript_source").$type<
      "podcastindex" | "assemblyai" | "description-url"
    >(),
    transcriptStatus: text("transcript_status").$type<
      "missing" | "fetching" | "available" | "failed"
    >(),
    transcriptFetchedAt: timestamp("transcript_fetched_at"),
    transcriptError: text("transcript_error"),
    processingError: text("processing_error"),
    rssGuid: text("rss_guid"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("episodes_podcast_index_id_idx").on(table.podcastIndexId),
    index("episodes_podcast_id_idx").on(table.podcastId),
    index("episodes_rss_guid_idx").on(table.rssGuid),
    check(
      "worth_it_score_range",
      sql`${table.worthItScore} >= 0 AND ${table.worthItScore} <= 10`,
    ),
    check(
      "summary_status_enum",
      sql`${table.summaryStatus} IN ('queued', 'running', 'summarizing', 'completed', 'failed')`,
    ),
    check(
      "transcript_source_enum",
      sql`${table.transcriptSource} IN ('podcastindex', 'assemblyai', 'description-url')`,
    ),
    check(
      "transcript_status_enum",
      sql`${table.transcriptStatus} IN ('missing', 'fetching', 'available', 'failed')`,
    ),
  ],
);

// User Subscriptions table
export const userSubscriptions = pgTable(
  "user_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    podcastId: integer("podcast_id")
      .references(() => podcasts.id, { onDelete: "cascade" })
      .notNull(),
    subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
    notificationsEnabled: boolean("notifications_enabled").default(true),
    isPinned: boolean("is_pinned").default(false).notNull(),
  },
  (table) => [
    uniqueIndex("user_subscriptions_user_podcast_idx").on(
      table.userId,
      table.podcastId,
    ),
    index("user_subscriptions_user_id_idx").on(table.userId),
    index("user_subscriptions_pinned_idx")
      .on(table.userId)
      .concurrently()
      .where(sql`${table.isPinned} = true`),
  ],
);

// Collections table
export const collections = pgTable(
  "collections",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isDefault: boolean("is_default").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("collections_user_id_idx").on(table.userId)],
);

// User Library table
export const userLibrary = pgTable(
  "user_library",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    episodeId: integer("episode_id")
      .references(() => episodes.id, { onDelete: "cascade" })
      .notNull(),
    savedAt: timestamp("saved_at").defaultNow().notNull(),
    notes: text("notes"),
    rating: integer("rating"), // 1-5 stars
    collectionId: integer("collection_id").references(() => collections.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("user_library_user_episode_idx").on(
      table.userId,
      table.episodeId,
    ),
    index("user_library_user_id_idx").on(table.userId),
    index("user_library_episode_id_idx").on(table.episodeId),
    index("user_library_collection_id_idx").on(table.collectionId),
  ],
);

// AI Config table (admin-selectable provider and model)
export const aiConfig = pgTable(
  "ai_config",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").$type<"openrouter" | "zai">().notNull(),
    model: text("model").notNull(),
    summarizationPrompt: text("summarization_prompt"),
    updatedBy: text("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check("provider_enum", sql`${table.provider} IN ('openrouter', 'zai')`),
  ],
);

// Bookmarks table
export const bookmarks = pgTable(
  "bookmarks",
  {
    id: serial("id").primaryKey(),
    userLibraryId: integer("user_library_id")
      .references(() => userLibrary.id, { onDelete: "cascade" })
      .notNull(),
    timestamp: integer("timestamp").notNull(), // in seconds
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("bookmarks_user_library_id_idx").on(table.userLibraryId)],
);

// Notifications table
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    episodeId: integer("episode_id").references(() => episodes.id, {
      onDelete: "cascade",
    }),
    type: text("type").$type<"new_episode" | "summary_completed">().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    isDismissed: boolean("is_dismissed").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notifications_user_unread_idx").on(
      table.userId,
      table.isRead,
      table.createdAt,
    ),
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
    check(
      "notification_type_enum",
      sql`${table.type} IN ('new_episode', 'summary_completed')`,
    ),
    uniqueIndex("notifications_user_episode_unique_idx")
      .on(table.userId, table.episodeId)
      .where(sql`episode_id IS NOT NULL AND type = 'new_episode'`),
  ],
);

// Push Subscriptions table
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("push_subscriptions_user_id_idx").on(table.userId)],
);

// Trending Topics table (daily LLM-generated snapshots)
export const trendingTopics = pgTable(
  "trending_topics",
  {
    id: serial("id").primaryKey(),
    topics: json("topics").$type<TrendingTopic[]>().notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    episodeCount: integer("episode_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("trending_topics_generated_at_idx").on(table.generatedAt)],
);

export const episodeTopics = pgTable(
  "episode_topics",
  {
    id: serial("id").primaryKey(),
    episodeId: integer("episode_id")
      .references(() => episodes.id, { onDelete: "cascade" })
      .notNull(),
    topic: varchar("topic", { length: 100 }).notNull(),
    relevance: decimal("relevance", { precision: 3, scale: 2 }).notNull(), // 0.00–1.00
    topicRank: integer("topic_rank"), // 1 = best, NULL = unranked
    rankedAt: timestamp("ranked_at"), // when ranking was last computed
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("episode_topics_episode_topic_idx").on(
      table.episodeId,
      table.topic,
    ),
    index("episode_topics_topic_idx").on(table.topic),
    index("episode_topics_topic_rank_idx").on(table.topicRank),
    check(
      "relevance_range",
      sql`${table.relevance} >= 0 AND ${table.relevance} <= 1`,
    ),
    check("topic_not_blank", sql`length(btrim(${table.topic})) > 0`),
    check(
      "topic_rank_positive",
      sql`${table.topicRank} IS NULL OR ${table.topicRank} >= 1`,
    ),
  ],
);

// Listen History table
export const listenHistory = pgTable(
  "listen_history",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    episodeId: integer("episode_id")
      .references(() => episodes.id, { onDelete: "cascade" })
      .notNull(),
    podcastIndexEpisodeId: text("podcast_index_episode_id").notNull(),
    startedAt: timestamp("started_at").notNull(),
    completedAt: timestamp("completed_at"),
    listenDurationSeconds: integer("listen_duration_seconds"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("listen_history_user_episode_idx").on(
      table.userId,
      table.episodeId,
    ),
    index("listen_history_user_id_idx").on(table.userId),
    index("listen_history_podcast_index_episode_id_idx").on(
      table.podcastIndexEpisodeId,
    ),
  ],
);

// User Queue Items table (denormalized episode fields for cross-device queue sync)
export const userQueueItems = pgTable(
  "user_queue_items",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    position: integer("position").notNull(),
    episodeId: text("episode_id").notNull(),
    title: text("title").notNull(),
    podcastTitle: text("podcast_title").notNull(),
    audioUrl: text("audio_url").notNull(),
    artwork: text("artwork"),
    duration: integer("duration"),
    chaptersUrl: text("chapters_url"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_queue_items_user_episode_idx").on(
      table.userId,
      table.episodeId,
    ),
    uniqueIndex("user_queue_items_user_position_idx").on(
      table.userId,
      table.position,
    ),
  ],
);

// User Player Session table (per-user resume state, one row per user)
export const userPlayerSession = pgTable("user_player_session", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  episodeId: text("episode_id").notNull(),
  title: text("title").notNull(),
  podcastTitle: text("podcast_title").notNull(),
  audioUrl: text("audio_url").notNull(),
  artwork: text("artwork"),
  duration: integer("duration"),
  chaptersUrl: text("chapters_url"),
  currentTime: decimal("current_time", { precision: 12, scale: 3 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  subscriptions: many(userSubscriptions),
  library: many(userLibrary),
  collections: many(collections),
  notifications: many(notifications),
  pushSubscriptions: many(pushSubscriptions),
  listenHistory: many(listenHistory),
  queueItems: many(userQueueItems),
  playerSession: one(userPlayerSession),
}));

export const podcastsRelations = relations(podcasts, ({ many }) => ({
  episodes: many(episodes),
  subscriptions: many(userSubscriptions),
}));

export const episodesRelations = relations(episodes, ({ one, many }) => ({
  podcast: one(podcasts, {
    fields: [episodes.podcastId],
    references: [podcasts.id],
  }),
  libraryEntries: many(userLibrary),
  notifications: many(notifications),
  listenHistory: many(listenHistory),
  topics: many(episodeTopics),
}));

export const episodeTopicsRelations = relations(episodeTopics, ({ one }) => ({
  episode: one(episodes, {
    fields: [episodeTopics.episodeId],
    references: [episodes.id],
  }),
}));

export const userSubscriptionsRelations = relations(
  userSubscriptions,
  ({ one }) => ({
    user: one(users, {
      fields: [userSubscriptions.userId],
      references: [users.id],
    }),
    podcast: one(podcasts, {
      fields: [userSubscriptions.podcastId],
      references: [podcasts.id],
    }),
  }),
);

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  user: one(users, {
    fields: [collections.userId],
    references: [users.id],
  }),
  libraryEntries: many(userLibrary),
}));

export const userLibraryRelations = relations(userLibrary, ({ one, many }) => ({
  user: one(users, {
    fields: [userLibrary.userId],
    references: [users.id],
  }),
  episode: one(episodes, {
    fields: [userLibrary.episodeId],
    references: [episodes.id],
  }),
  collection: one(collections, {
    fields: [userLibrary.collectionId],
    references: [collections.id],
  }),
  bookmarks: many(bookmarks),
}));

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  libraryEntry: one(userLibrary, {
    fields: [bookmarks.userLibraryId],
    references: [userLibrary.id],
  }),
}));

export const aiConfigRelations = relations(aiConfig, ({ one }) => ({
  updatedByUser: one(users, {
    fields: [aiConfig.updatedBy],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  episode: one(episodes, {
    fields: [notifications.episodeId],
    references: [episodes.id],
  }),
}));

export const pushSubscriptionsRelations = relations(
  pushSubscriptions,
  ({ one }) => ({
    user: one(users, {
      fields: [pushSubscriptions.userId],
      references: [users.id],
    }),
  }),
);

export const listenHistoryRelations = relations(listenHistory, ({ one }) => ({
  user: one(users, {
    fields: [listenHistory.userId],
    references: [users.id],
  }),
  episode: one(episodes, {
    fields: [listenHistory.episodeId],
    references: [episodes.id],
  }),
}));

export const userQueueItemsRelations = relations(userQueueItems, ({ one }) => ({
  user: one(users, {
    fields: [userQueueItems.userId],
    references: [users.id],
  }),
}));

export const userPlayerSessionRelations = relations(
  userPlayerSession,
  ({ one }) => ({
    user: one(users, {
      fields: [userPlayerSession.userId],
      references: [users.id],
    }),
  }),
);

// Type exports for use in the application
export type RateLimit = typeof rateLimits.$inferSelect;
export type NewRateLimit = typeof rateLimits.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Podcast = typeof podcasts.$inferSelect;
export type NewPodcast = typeof podcasts.$inferInsert;

export type Episode = typeof episodes.$inferSelect;
export type NewEpisode = typeof episodes.$inferInsert;

export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type NewUserSubscription = typeof userSubscriptions.$inferInsert;

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;

export type UserLibraryEntry = typeof userLibrary.$inferSelect;
export type NewUserLibraryEntry = typeof userLibrary.$inferInsert;

export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;

export type AiConfigRow = typeof aiConfig.$inferSelect;
export type NewAiConfigRow = typeof aiConfig.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;

export type ListenHistoryEntry = typeof listenHistory.$inferSelect;
export type NewListenHistoryEntry = typeof listenHistory.$inferInsert;

export type EpisodeTopic = typeof episodeTopics.$inferSelect;
export type NewEpisodeTopic = typeof episodeTopics.$inferInsert;

/** Shape of a single topic cluster in the trending_topics JSON column. */
export interface TrendingTopic {
  name: string;
  description: string;
  episodeCount: number;
  episodeIds: number[];
  // Pre-#279 snapshot rows lack a slug key at runtime; consumers should call
  // `getTopicSlug()` from @/lib/trending rather than accessing this field directly.
  slug?: string;
}

export type TrendingTopicsRow = typeof trendingTopics.$inferSelect;
export type NewTrendingTopicsRow = typeof trendingTopics.$inferInsert;

export type SummaryStatus = NonNullable<Episode["summaryStatus"]>;
export type TranscriptStatus = NonNullable<Episode["transcriptStatus"]>;

/** Statuses that indicate a summarization run is still in progress. */
export const IN_PROGRESS_STATUSES: SummaryStatus[] = [
  "queued",
  "running",
  "summarizing",
];

export type UserQueueItem = typeof userQueueItems.$inferSelect;
export type NewUserQueueItem = typeof userQueueItems.$inferInsert;

export type UserPlayerSession = typeof userPlayerSession.$inferSelect;
export type NewUserPlayerSession = typeof userPlayerSession.$inferInsert;

// ---------------------------------------------------------------------------
// Denormalization bridge check (ADR-036)
//
// `user_queue_items` and `user_player_session` intentionally denormalize the
// episode metadata instead of joining to `episodes`. ADR-036 accepts cosmetic
// drift on retitle — but silently losing a field when someone adds one to
// `AudioEpisode` without adding a column is not acceptable. The type-level
// assertion below fails the build if the denormalized columns stop being a
// superset of `AudioEpisode` (key-wise; column nullability does not have to
// match `?` optionality).
// ---------------------------------------------------------------------------

type _AudioEpisodeNonIdKeys = keyof Omit<
  import("@/lib/schemas/listening-queue").AudioEpisode,
  "id"
>;

type _QueueDenormKeys = keyof Omit<
  UserQueueItem,
  "id" | "userId" | "position" | "updatedAt" | "episodeId"
>;

type _SessionDenormKeys = keyof Omit<
  UserPlayerSession,
  "userId" | "episodeId" | "currentTime" | "updatedAt"
>;

type _Assert<T extends true> = T;
type _KeysMatch<A, B> = [A, B] extends [B, A] ? true : false;

// If either of these fails to compile, the denormalized columns and
// AudioEpisode have drifted. Fix by adding/removing a column on
// user_queue_items / user_player_session to match AudioEpisode's shape.
export type _QueueDenormInvariant = _Assert<
  _KeysMatch<_QueueDenormKeys, _AudioEpisodeNonIdKeys>
>;
export type _SessionDenormInvariant = _Assert<
  _KeysMatch<_SessionDenormKeys, _AudioEpisodeNonIdKeys>
>;
