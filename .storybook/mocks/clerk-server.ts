// Stub for @clerk/nextjs/server in Storybook
export const auth = async () => ({ userId: "storybook-user" });
export const currentUser = async () => ({
  id: "storybook-user",
  firstName: "Storybook",
  lastName: "User",
});
