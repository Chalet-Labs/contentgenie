// Stub for server actions in Storybook
const noop = async () => ({ success: true, message: "Storybook mock" });

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
export const subscribeToPodcast = noop;
export const unsubscribeFromPodcast = noop;
export const getUserLibrary = async () => ({ items: [], error: null });
export const isEpisodeSaved = async () => false;
