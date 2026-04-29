// Stub for server actions in Storybook
const noop = async () => ({ success: true });

export const saveEpisodeToLibrary = noop;
export const removeEpisodeFromLibrary = noop;
export const updateLibraryNotes = noop;
export const updateLibraryRating = noop;
export const addBookmark = noop;
export const updateBookmark = noop;
export const deleteBookmark = noop;
export const getBookmarks = async () => ({ bookmarks: [], error: null });
export const getEpisodeAverageRating = async () => ({
  averageRating: 4.2,
  ratingCount: 15,
  error: null,
});
export const createCollection = noop;
export const updateCollection = noop;
export const deleteCollection = noop;
export const getUserCollections = async () => ({
  collections: [],
  error: null,
});
export const getCollection = async () => ({
  collection: null,
  items: [],
  error: null,
});
export const moveEpisodeToCollection = noop;
export const subscribeToPodcast = noop;
export const unsubscribeFromPodcast = noop;
export const setSubscriptionSort = noop;
export const togglePinSubscription = async () => ({
  success: true,
  data: { isPinned: true },
});
export const getUserLibrary = async () => ({ items: [], error: null });
export const isEpisodeSaved = async () => false;
export const getLibraryEntryByEpisodeId = async (
  _episodePodcastIndexId: string,
) => ({ libraryEntryId: 42, episodeId: 10 });
export const getDashboardStats = async () => ({
  subscriptionCount: 3,
  savedCount: 5,
  error: null,
});
export const getQueueEpisodeScores = async () => ({});
export const getPinnedSubscriptions = async () => ({
  success: true as const,
  data: [
    {
      id: 1,
      podcastId: 101,
      podcastIndexId: "101",
      title: "Lex Fridman Podcast",
      imageUrl: null,
    },
    {
      id: 2,
      podcastId: 102,
      podcastIndexId: "102",
      title: "Search Engine",
      imageUrl: null,
    },
    {
      id: 3,
      podcastId: 103,
      podcastIndexId: "103",
      title: "The Daily",
      imageUrl: null,
    },
  ],
});
