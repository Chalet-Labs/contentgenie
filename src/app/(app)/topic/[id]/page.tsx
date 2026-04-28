import { notFound, permanentRedirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { canonicalTopics } from "@/db/schema";

const MAX_MERGE_DEPTH = 16;

type CanonicalTopic = typeof canonicalTopics.$inferSelect;

type WalkerResult = { terminal: CanonicalTopic } | { error: "cycle" | "depth" };

async function walkMergedChain(start: CanonicalTopic): Promise<WalkerResult> {
  const seen = new Set<number>();
  let current = start;
  let depth = 0;

  while (current.status === "merged") {
    if (depth >= MAX_MERGE_DEPTH) {
      console.error("[topic] merge depth exceeded", {
        startId: start.id,
        currentId: current.id,
        depth,
      });
      return { error: "depth" };
    }

    if (seen.has(current.id)) {
      console.error("[topic] merge cycle detected", {
        startId: start.id,
        cycleAtId: current.id,
        seen: Array.from(seen),
      });
      return { error: "cycle" };
    }

    seen.add(current.id);

    const nextId = current.mergedIntoId;
    if (!nextId) {
      // merged but no pointer — schema invariant violated
      console.error("[topic] merged topic has null mergedIntoId", {
        id: current.id,
      });
      return { error: "cycle" };
    }

    const next = await db.query.canonicalTopics.findFirst({
      where: eq(canonicalTopics.id, nextId),
    });

    if (!next) {
      console.error("[topic] merge chain broken — target not found", {
        from: current.id,
        to: nextId,
      });
      return { error: "cycle" };
    }

    depth++;
    current = next;
  }

  return { terminal: current };
}

interface TopicPageProps {
  params: { id: string };
}

export default async function TopicPage({ params }: TopicPageProps) {
  const parsed = Number(params.id);
  if (!Number.isInteger(parsed) || parsed <= 0 || Number.isNaN(parsed)) {
    notFound();
  }

  const topic = await db.query.canonicalTopics.findFirst({
    where: eq(canonicalTopics.id, parsed),
  });

  if (!topic) {
    notFound();
  }

  if (topic.status === "merged") {
    const result = await walkMergedChain(topic);
    if ("error" in result) {
      notFound();
    }
    permanentRedirect(`/topic/${result.terminal.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-2xl">{topic.label}</CardTitle>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary" className="capitalize">
                  {topic.kind}
                </Badge>
                {topic.status === "dormant" && (
                  <Badge variant="outline">Dormant</Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {topic.summary && (
            <p className="text-muted-foreground">{topic.summary}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {topic.episodeCount}{" "}
            {topic.episodeCount === 1 ? "episode" : "episodes"}
          </p>
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-muted-foreground">
              Coming soon — full topic details and episode list are on the
              roadmap.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
