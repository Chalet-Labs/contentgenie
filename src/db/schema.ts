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
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

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
  ]
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
    worthItDimensions: json("worth_it_dimensions").$type<{
      uniqueness: number;
      actionability: number;
      timeValue: number;
    }>(),
    processedAt: timestamp("processed_at"),
    summaryRunId: text("summary_run_id"),
    summaryStatus: text("summary_status").$type<
      "queued" | "running" | "transcribing" | "summarizing" | "completed" | "failed"
    >(),
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
      sql`${table.worthItScore} >= 0 AND ${table.worthItScore} <= 10`
    ),
    check(
      "summary_status_enum",
      sql`${table.summaryStatus} IN ('queued', 'running', 'transcribing', 'summarizing', 'completed', 'failed')`
    ),
  ]
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
  },
  (table) => [
    uniqueIndex("user_subscriptions_user_podcast_idx").on(
      table.userId,
      table.podcastId
    ),
    index("user_subscriptions_user_id_idx").on(table.userId),
  ]
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
  (table) => [index("collections_user_id_idx").on(table.userId)]
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
      table.episodeId
    ),
    index("user_library_user_id_idx").on(table.userId),
    index("user_library_episode_id_idx").on(table.episodeId),
    index("user_library_collection_id_idx").on(table.collectionId),
  ]
);

// AI Config table (admin-selectable provider and model)
export const aiConfig = pgTable(
  "ai_config",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").$type<"openrouter" | "zai">().notNull(),
    model: text("model").notNull(),
    updatedBy: text("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check("provider_enum", sql`${table.provider} IN ('openrouter', 'zai')`),
  ]
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
  (table) => [index("bookmarks_user_library_id_idx").on(table.userLibraryId)]
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  subscriptions: many(userSubscriptions),
  library: many(userLibrary),
  collections: many(collections),
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
  })
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

// Type exports for use in the application
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

export type SummaryStatus = NonNullable<Episode["summaryStatus"]>;

/** Statuses that indicate a summarization run is still in progress. */
export const IN_PROGRESS_STATUSES: SummaryStatus[] = [
  "queued",
  "running",
  "transcribing",
  "summarizing",
];
