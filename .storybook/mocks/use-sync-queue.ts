// The real hook reads from SyncQueueProvider context; stories render components
// in isolation without the provider, so return a no-op queue snapshot here.
export const useSyncQueue = () => ({
  pendingCount: 0,
  isSyncing: false,
  hasPending: (_entityKey: string) => false,
  hasFailed: (_entityKey: string) => false,
  replayAll: async () => {},
});

export const useSyncQueueContext = useSyncQueue;
