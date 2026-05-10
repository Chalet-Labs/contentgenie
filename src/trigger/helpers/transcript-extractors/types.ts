export interface ExtractorContext {
  episode: {
    podcastIndexId: string;
    title: string;
    link: string | null;
    rssGuid: string | null;
  };
  podcast: {
    podcastIndexId: string;
    title: string;
  };
}

export interface Extractor {
  id: string;
  extract: (ctx: ExtractorContext) => Promise<string | undefined>;
}

export interface ExtractorResult {
  transcript: string;
  extractorId: string;
}
