import { notFound, permanentRedirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { canonicalTopics } from "@/db/schema";
import {
  walkMergedChain,
  TOPIC_DISPLAY_COLUMNS,
} from "@/app/(app)/topic/[id]/merge-walker";

interface TopicPageProps {
  params: { id: string };
}

export default async function TopicPage({ params }: TopicPageProps) {
  const parsed = Number(params.id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    notFound();
  }

  const topic = await db.query.canonicalTopics.findFirst({
    columns: TOPIC_DISPLAY_COLUMNS,
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
