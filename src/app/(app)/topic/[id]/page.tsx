import { notFound, permanentRedirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  walkMergedChain,
  findTopicSummary,
} from "@/app/(app)/topic/[id]/merge-walker";
import {
  getTopicDetailData,
  triggerTopicDigestRefresh,
} from "@/app/actions/topics";
import { TopicDigestPanel } from "@/components/topics/topic-digest-panel";
import { TopicEpisodeList } from "@/components/topics/topic-episode-list";
import { TopicRelatedList } from "@/components/topics/topic-related-list";
import { TopicEmptyState } from "@/components/topics/topic-empty-state";
import { MIN_DERIVED_COUNT_FOR_DIGEST } from "@/lib/topic-digest-thresholds";

interface TopicPageProps {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

// Postgres serial/integer max is 2^31-1; values above this would cause a DB range error.
const POSTGRES_MAX_INT = 2_147_483_647;

export default async function TopicPage({
  params,
  searchParams,
}: TopicPageProps) {
  if (!/^[1-9][0-9]*$/.test(params.id)) {
    notFound();
  }
  const parsed = parseInt(params.id, 10);
  if (parsed > POSTGRES_MAX_INT) {
    notFound();
  }

  const topic = await findTopicSummary(parsed);

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

  const showOnlyUnheard = searchParams.unheard === "true";
  const detailResult = await getTopicDetailData({
    canonicalTopicId: topic.id,
    showOnlyUnheard,
  });

  if (!detailResult.success) {
    notFound();
  }

  const { canonical, digest, episodes, relatedTopics } = detailResult.data;
  const eligibleForDigest =
    canonical.completedSummaryCount >= MIN_DERIVED_COUNT_FOR_DIGEST;

  let initialRunId: string | null = null;
  let initialAccessToken: string | null = null;
  if (digest === null && eligibleForDigest) {
    const refresh = await triggerTopicDigestRefresh({
      canonicalTopicId: canonical.id,
    });
    if (
      refresh.success &&
      refresh.data.status === "queued" &&
      refresh.data.runId &&
      refresh.data.publicAccessToken
    ) {
      initialRunId = refresh.data.runId;
      initialAccessToken = refresh.data.publicAccessToken;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-2xl">{canonical.label}</CardTitle>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary" className="capitalize">
                  {canonical.kind}
                </Badge>
                {canonical.status === "dormant" && (
                  <Badge variant="outline">Dormant</Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {canonical.summary && (
            <p className="text-muted-foreground">{canonical.summary}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {canonical.episodeCount}{" "}
            {canonical.episodeCount === 1 ? "episode" : "episodes"}
          </p>
        </CardContent>
      </Card>

      {eligibleForDigest ? (
        <TopicDigestPanel
          canonicalTopicId={canonical.id}
          initialDigest={digest}
          initialRunId={initialRunId}
          initialAccessToken={initialAccessToken}
          canRefresh={canonical.status === "active"}
        />
      ) : (
        <TopicEmptyState
          label={canonical.label}
          episodeCount={canonical.completedSummaryCount}
        />
      )}

      <TopicEpisodeList episodes={episodes} />

      <TopicRelatedList items={relatedTopics} />
    </div>
  );
}
