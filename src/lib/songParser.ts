import { SongDetails, SongSection, SheetMusicLink } from '@/types/Song';
import { cleanSongTitle } from './songUtils';

export function extractYouTubeVideoId(urlOrText: string): string | null {
  if (!urlOrText) return null;
  const match = urlOrText.match(
    /(?:https?:\/\/)?(?:www\.|music\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts|live)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]+)/i
  );
  return match ? match[1] : null;
}

export function extractYouTubeUrl(urlOrText: string): string | null {
  if (!urlOrText) return null;
  const match = urlOrText.match(
    /(https?:\/\/(?:www\.|music\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts|live)\/|\S*?[?&]v=|\S+)|youtu\.be\/[a-zA-Z0-9_\-=&?%]+)[^\s<>'\"\]\)]*)/i
  );
  if (match) {
    return match[1].replace(/[),;.]+$/, '');
  }
  return null;
}

export function parseRockSongContent(item: {
  Id: number;
  Title: string;
  Content?: string | null;
}): SongDetails {
  const rawTitle = item.Title || '';
  const cleanTitleStr = cleanSongTitle(rawTitle);
  const rawContent = item.Content || '';
  const rockUrl = `https://rock.favor.church/ContentChannelItem/${item.Id}`;

  const meta: Record<string, string> = {};
  const lines = rawContent.split(/\r?\n/);
  const bodyLines: string[] = [];
  let inMeta = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (inMeta && trimmed.startsWith('**') && trimmed.includes(':**')) {
      const match = trimmed.match(/^\*\*(.*?):\*\*\s*(.*)$/);
      if (match) {
        meta[match[1].trim().toLowerCase()] = match[2].trim();
        continue;
      }
    }
    if (trimmed === '---') {
      inMeta = false;
      continue;
    }
    bodyLines.push(line);
  }

  const rawBody = bodyLines.join('\n').trim();
  const sectionBlocks = rawBody.split(/(?=\n##\s+)/);

  const sheetMusicLinks: SheetMusicLink[] = [];
  const sections: SongSection[] = [];

  // Also search for sheet music links anywhere in the content or sections
  const globalLinkMatches = Array.from(rawContent.matchAll(/\[(.*?)\]\((.*?)\)/g));
  for (const match of globalLinkMatches) {
    const label = match[1].trim();
    const url = match[2].trim();
    if (
      label.toLowerCase().includes('sheet') ||
      label.toLowerCase().includes('chord') ||
      label.toLowerCase().includes('chart') ||
      label.toLowerCase().includes('lead') ||
      label.toLowerCase().includes('vocal') ||
      url.endsWith('.pdf')
    ) {
      if (!sheetMusicLinks.some((l) => l.url === url)) {
        sheetMusicLinks.push({ label, url });
      }
    }
  }

  // Check top-level metadata for YouTube link
  const metaYoutubeUrl = meta['youtube'] || meta['video'] || meta['youtube url'] || meta['reference video'] || meta['reference'];
  const globalYoutubeVideoId = extractYouTubeVideoId(metaYoutubeUrl || rawContent);
  const globalYoutubeUrl = extractYouTubeUrl(metaYoutubeUrl || rawContent);

  for (const block of sectionBlocks) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    if (trimmedBlock.startsWith('##')) {
      const headerMatch = trimmedBlock.match(/^##\s*(.*?)\n([\s\S]*)$/);
      if (headerMatch) {
        const sectionTitle = headerMatch[1].trim();
        const sectionText = headerMatch[2].trim();

        if (sectionTitle.toLowerCase().includes('sheet music') || sectionTitle.toLowerCase().includes('chord chart')) {
          // Extract links from sheet music section
          const sectionLinks = Array.from(sectionText.matchAll(/\[(.*?)\]\((.*?)\)/g));
          for (const m of sectionLinks) {
            const label = m[1].trim();
            const url = m[2].trim();
            if (!sheetMusicLinks.some((l) => l.url === url)) {
              sheetMusicLinks.push({ label, url });
            }
          }
        } else {
          const sectionVideoId = extractYouTubeVideoId(sectionText || sectionTitle);
          const sectionYoutubeUrl = extractYouTubeUrl(sectionText || sectionTitle);

          sections.push({
            title: sectionTitle,
            content: sectionText,
            isChorus: sectionTitle.toLowerCase().includes('chorus'),
            youtubeVideoId: sectionVideoId || undefined,
            youtubeUrl: sectionYoutubeUrl || undefined,
          });
        }
      } else {
        const titleOnly = trimmedBlock.replace(/^##\s*/, '').trim();
        const sectionVideoId = extractYouTubeVideoId(titleOnly);
        const sectionYoutubeUrl = extractYouTubeUrl(titleOnly);

        sections.push({
          title: titleOnly,
          content: '',
          isChorus: titleOnly.toLowerCase().includes('chorus'),
          youtubeVideoId: sectionVideoId || undefined,
          youtubeUrl: sectionYoutubeUrl || undefined,
        });
      }
    } else {
      const sectionVideoId = extractYouTubeVideoId(trimmedBlock);
      const sectionYoutubeUrl = extractYouTubeUrl(trimmedBlock);

      sections.push({
        title: 'Lyrics',
        content: trimmedBlock,
        isChorus: false,
        youtubeVideoId: sectionVideoId || undefined,
        youtubeUrl: sectionYoutubeUrl || undefined,
      });
    }
  }

  const firstSectionWithVideo = sections.find((s) => s.youtubeVideoId || s.youtubeUrl);
  const finalYoutubeVideoId = globalYoutubeVideoId || firstSectionWithVideo?.youtubeVideoId;
  const finalYoutubeUrl =
    globalYoutubeUrl ||
    firstSectionWithVideo?.youtubeUrl ||
    (finalYoutubeVideoId ? `https://www.youtube.com/watch?v=${finalYoutubeVideoId}` : undefined);

  return {
    id: item.Id,
    title: rawTitle,
    cleanTitle: cleanTitleStr || rawTitle,
    artist: meta['artist'] || meta['artists'] || meta['author'] || meta['writer'],
    key: meta['key'] || meta['original key'],
    bpm: meta['bpm'] || meta['tempo'],
    timeSignature: meta['time signature'] || meta['time'],
    ccli: meta['ccli'] || meta['ccli #'] || meta['ccli song no'],
    themes: meta['themes'] || meta['theme'] || meta['tags'],
    rockUrl,
    sheetMusicLinks,
    sections,
    youtubeVideoId: finalYoutubeVideoId || undefined,
    youtubeUrl: finalYoutubeUrl || undefined,
    rawContent,
  };
}
