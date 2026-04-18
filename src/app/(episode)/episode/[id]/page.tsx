import { auth } from "@clerk/nextjs/server";
import { AuthenticatedEpisodeDetail } from "@/components/episodes/authenticated-episode-detail";
import { PublicEpisodeDetail } from "@/components/episodes/public-episode-detail";
import { ADMIN_ROLE } from "@/lib/auth-roles";

interface EpisodePageProps {
  params: {
    id: string;
  };
}

export default async function EpisodePage({ params }: EpisodePageProps) {
  const { userId, has } = await auth();

  if (!userId) {
    return <PublicEpisodeDetail episodeId={params.id} />;
  }

  return (
    <AuthenticatedEpisodeDetail
      episodeId={params.id}
      userId={userId}
      isAdmin={has?.({ role: ADMIN_ROLE }) ?? false}
    />
  );
}
