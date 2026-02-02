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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("podcasts_podcast_index_id_idx").on(table.podcastIndexId),
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
    worthItScore: decimal("worth_it_score", { precision: 3, scale: 2 }), // 0.00 - 10.00
    processedAt: timestamp("processed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("episodes_podcast_index_id_idx").on(table.podcastIndexId),
    index("episodes_podcast_id_idx").on(table.podcastId),
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
    index("user_library_collection_id_idx").on(table.collectionId),
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
