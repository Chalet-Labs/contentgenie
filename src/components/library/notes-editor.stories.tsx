import type { Meta, StoryObj } from "@storybook/react";
import { NotesEditor } from "./notes-editor";

const meta: Meta<typeof NotesEditor> = {
  title: "Library/NotesEditor",
  component: NotesEditor,
};

export default meta;
type Story = StoryObj<typeof NotesEditor>;

export const Empty: Story = {
  args: {
    episodePodcastIndexId: "123",
    initialNotes: "",
  },
};

export const WithContent: Story = {
  args: {
    episodePodcastIndexId: "123",
    initialNotes:
      "Great episode about AI in podcasting.\n\nKey points:\n- AI can help with editing\n- Transcription is getting better\n- Important to maintain authenticity",
  },
};
