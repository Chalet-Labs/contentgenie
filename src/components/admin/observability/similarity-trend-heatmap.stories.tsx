import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SimilarityTrendHeatmap } from "@/components/admin/observability/similarity-trend-heatmap";
import {
  SIMILARITY_BUCKET_SIZE,
  type SimilarityTrendEntry,
  type SimilarityBucket,
} from "@/lib/observability/similarity-buckets";

const NUM_BUCKETS = Math.ceil(1 / SIMILARITY_BUCKET_SIZE);

function makeDay(
  daysAgo: number,
  countFn: (bucketIdx: number) => number,
): SimilarityTrendEntry {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(0, 0, 0, 0);

  const buckets: SimilarityBucket[] = Array.from(
    { length: NUM_BUCKETS },
    (_, i) => ({
      bucket: Math.round(i * SIMILARITY_BUCKET_SIZE * 1e10) / 1e10,
      count: countFn(i),
    }),
  );

  return { bucket: d, buckets };
}

// Realistic: most resolutions cluster at high similarity (buckets 14-19)
const realisticEntries: SimilarityTrendEntry[] = [
  makeDay(6, (i) => (i >= 14 ? 80 + i * 5 : i >= 10 ? 20 : 2)),
  makeDay(5, (i) => (i >= 14 ? 120 + i * 3 : i >= 10 ? 15 : 1)),
  makeDay(4, (i) => (i >= 14 ? 60 + i * 4 : 0)),
  makeDay(3, (i) => (i >= 14 ? 200 : i >= 12 ? 30 : 0)),
  makeDay(2, (i) => (i >= 14 ? 90 : i >= 10 ? 10 : 3)),
  makeDay(1, (i) => (i >= 15 ? 150 : 0)),
  makeDay(0, (i) => (i >= 14 ? 100 + i : 0)),
];

// Sparse: only a few cells filled
const sparseEntries: SimilarityTrendEntry[] = [
  makeDay(2, (i) => (i === 18 ? 5 : 0)),
  makeDay(1, (i) => (i === 15 ? 1 : 0)),
  makeDay(0, (i) => (i === 19 ? 3 : 0)),
];

const meta: Meta<typeof SimilarityTrendHeatmap> = {
  title: "Admin/Observability/SimilarityTrendHeatmap",
  component: SimilarityTrendHeatmap,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof SimilarityTrendHeatmap>;

export const Realistic: Story = {
  args: { entries: realisticEntries },
};

export const Sparse: Story = {
  args: { entries: sparseEntries },
};

export const Empty: Story = {
  args: { entries: [] },
};
