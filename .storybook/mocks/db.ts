// Stub for @/db in Storybook
export const db = {
  query: {},
  insert: () => ({ values: () => ({ returning: () => [], onConflictDoNothing: () => {} }) }),
  update: () => ({ set: () => ({ where: () => {} }) }),
  delete: () => ({ where: () => {} }),
};
