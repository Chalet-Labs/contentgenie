import { headers } from "next/headers";
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
import { POSTGRES_MAX_INT } from "@/lib/postgres-limits";
import { loadTopicDetailSearchParams } from "@/lib/search-params/topic-detail";

interface TopicPageProps {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

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

  const { unheard: showOnlyUnheard } =
    loadTopicDetailSearchParams(searchParams);
  const detailResult = await getTopicDetailData({
    canonicalTopicId: topic.id,
    showOnlyUnheard,
  });

  if (!detailResult.success) {
    if (detailResult.error === "not-found") notFound();
    console.error("[topic-detail-page] getTopicDetailData failed", {
      id: parsed,
      error: detailResult.error,
    });
    throw new Error(`Topic detail failed: ${detailResult.error}`);
  }

  const { canonical, episodes, relatedTopics } = detailResult.data;
  let digest = detailResult.data.digest;
  const eligibleForDigest =
    canonical.completedSummaryCount >= MIN_DERIVED_COUNT_FOR_DIGEST;

  const requestHeaders = headers();
  const isPrefetch =
    requestHeaders.get("Next-Router-Prefetch") === "1" ||
    requestHeaders.get("next-router-prefetch") === "1";

  let showDigestPanel = digest !== null;
  let initialRunId: string | null = null;
  let initialAccessToken: string | null = null;
  let autoTriggerError: string | null = null;
  if (
    digest === null &&
    eligibleForDigest &&
    canonical.status === "active" &&
    !isPrefetch
  ) {
    const refresh = await triggerTopicDigestRefresh({
      canonicalTopicId: canonical.id,
    });
    if (!refresh.success) {
      console.error("[topic-detail-page] auto-trigger failed", {
        canonicalTopicId: canonical.id,
        error: refresh.error,
      });
      autoTriggerError = refresh.error;
      showDigestPanel = true;
    } else if (refresh.data.status === "cached") {
      showDigestPanel = true;
      // Race: another request created the digest between our initial fetch and
      // triggerTopicDigestRefresh. Re-fetch to hydrate initialDigest so the
      // panel doesn't mount with a null digest and no loading state.
      const refetch = await getTopicDetailData({
        canonicalTopicId: canonical.id,
        showOnlyUnheard,
      });
      if (refetch.success && refetch.data.digest) {
        digest = refetch.data.digest;
      }
    } else if (refresh.data.status === "queued") {
      showDigestPanel = true;
      if (refresh.data.runId && refresh.data.publicAccessToken) {
        initialRunId = refresh.data.runId;
        initialAccessToken = refresh.data.publicAccessToken;
      } else {
        console.error("[topic-detail-page] queued status missing runId/token", {
          canonicalTopicId: canonical.id,
          data: refresh.data,
        });
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <h1 className="sr-only">{canonical.label}</h1>
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

      {eligibleForDigest && showDigestPanel ? (
        <TopicDigestPanel
          canonicalTopicId={canonical.id}
          initialDigest={digest}
          initialRunId={initialRunId}
          initialAccessToken={initialAccessToken}
          canRefresh={canonical.status === "active"}
          autoTriggerError={autoTriggerError}
        />
      ) : (
        <TopicEmptyState
          label={canonical.label}
          summarizedCount={canonical.completedSummaryCount}
          totalEpisodeCount={canonical.episodeCount}
        />
      )}

      <TopicEpisodeList episodes={episodes} />

      <TopicRelatedList items={relatedTopics} />
    </div>
  );
}
