import { NextResponse } from 'next/server';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { cleanSongTitle } from '@/lib/songUtils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const titleParam = searchParams.get('title') || '';
  const idParam = searchParams.get('id') || '';

  try {
    let songItem: any = null;

    if (idParam) {
      songItem = await rockGet(`/ContentChannelItems/${idParam}`);
    } else if (titleParam) {
      const clean = cleanSongTitle(titleParam);
      const q = clean.replace(/'/g, "''");
      const items = (await rockGet('/ContentChannelItems', {
        $filter: `ContentChannelId eq 18 and substringof('${q}', Title)`,
        $top: 10,
      })) as any[];

      if (items && items.length > 0) {
        songItem =
          items.find(
            (it) => cleanSongTitle(it.Title).toLowerCase() === clean.toLowerCase()
          ) || items[0];
      }
    }

    if (!songItem) {
      return new Response(
        renderNotFoundHtml(titleParam || idParam),
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    const html = renderSongHtml(songItem);
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch song' }, { status: 500 });
  }
}

function renderSongHtml(songItem: any) {
  const rawTitle = songItem.Title || '';
  const cleanTitleStr = cleanSongTitle(rawTitle);
  const rawContent = songItem.Content || '';

  const meta: Record<string, string> = {};
  const lines = rawContent.split('\n');
  const bodyLines: string[] = [];
  let inMeta = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (inMeta && trimmed.startsWith('**') && trimmed.includes(':**')) {
      const match = trimmed.match(/^\*\*(.*?):\*\*\s*(.*)$/);
      if (match) {
        meta[match[1].trim()] = match[2].trim();
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

  let formattedBodyHtml = '';
  for (const block of sectionBlocks) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    if (trimmedBlock.startsWith('##')) {
      const headerMatch = trimmedBlock.match(/^##\s*(.*?)\n([\s\S]*)$/);
      if (headerMatch) {
        const sectionTitle = headerMatch[1].trim();
        const sectionText = headerMatch[2].trim();
        formattedBodyHtml += renderSection(sectionTitle, sectionText);
      } else {
        formattedBodyHtml += renderSection('', trimmedBlock.replace(/^##\s*/, ''));
      }
    } else {
      formattedBodyHtml += renderSection('', trimmedBlock);
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(cleanTitleStr)} - Favor Church Music</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
  </style>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen antialiased selection:bg-violet-200">

  <!-- Header Navigation Bar -->
  <header class="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200/80 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
    <div class="flex items-center gap-3">
      <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white font-bold text-base shadow-xs">
        🎵
      </span>
      <div>
        <h2 class="text-sm sm:text-base font-bold text-slate-900 leading-tight">${escapeHtml(cleanTitleStr)}</h2>
        <p class="text-[11px] font-medium text-slate-500">Favor Church Songs Library</p>
      </div>
    </div>
    <a
      href="https://rock.favor.church/ContentChannelItem/${songItem.Id}"
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition-all cursor-pointer"
    >
      <span>Open in Rock RMS</span>
      <span class="text-slate-400">↗</span>
    </a>
  </header>

  <!-- Main Content Area -->
  <main class="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
    <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xl p-6 sm:p-10 space-y-8">
      
      <!-- Song Title & Metadata Badges -->
      <div class="border-b border-slate-100 pb-6">
        <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          ${escapeHtml(cleanTitleStr)}
        </h1>

        <div class="flex flex-wrap items-center gap-2 mt-4">
          ${meta.Key ? `<span class="inline-flex items-center gap-1.5 rounded-lg bg-violet-100 px-3 py-1 text-xs font-bold text-violet-900 border border-violet-200 shadow-2xs">🎹 Key: ${escapeHtml(meta.Key)}</span>` : ''}
          ${meta.Artist ? `<span class="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 border border-slate-200">🎤 ${escapeHtml(meta.Artist)}</span>` : ''}
          ${meta.CCLI ? `<span class="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 border border-slate-200">📄 CCLI: ${escapeHtml(meta.CCLI)}</span>` : ''}
          ${meta.Themes ? `<span class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 border border-indigo-200">🏷️ ${escapeHtml(meta.Themes)}</span>` : ''}
        </div>
      </div>

      <!-- Formatted Song Content (Lyrics / Sections) -->
      <div class="space-y-6">
        ${formattedBodyHtml || '<p class="text-slate-500 italic">No lyrics content available.</p>'}
      </div>

    </div>
  </main>

</body>
</html>`;
}

function renderSection(title: string, text: string) {
  const isChorus = title.toLowerCase().includes('chorus');
  const isSheetMusic = title.toLowerCase().includes('sheet music');

  if (isSheetMusic) {
    const linkMatches = Array.from(text.matchAll(/\[(.*?)\]\((.*?)\)/g));
    if (linkMatches.length > 0) {
      const linksHtml = linkMatches
        .map(
          (m) =>
            `<a href="${m[2]}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-xs font-bold text-violet-900 hover:bg-violet-100 transition-all shadow-2xs">
              <span class="flex items-center gap-2">📄 ${escapeHtml(m[1])}</span>
              <span class="text-violet-600 font-semibold">Download ↗</span>
            </a>`
        )
        .join('');

      return `<div class="rounded-2xl border border-violet-200 bg-violet-50/30 p-5 my-6">
        <h3 class="text-xs font-extrabold text-violet-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <span>🎵</span> Sheet Music & Chord Charts
        </h3>
        <div class="grid sm:grid-cols-2 gap-2.5">
          ${linksHtml}
        </div>
      </div>`;
    }
  }

  const formattedText = escapeHtml(text)
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-semibold text-violet-700 hover:text-violet-900 underline underline-offset-2">$1 ↗</a>')
    .replace(/\n/g, '<br>');

  const cardStyle = isChorus
    ? 'bg-violet-50/80 border-l-4 border-violet-600 rounded-r-2xl p-5 my-6 shadow-2xs'
    : 'bg-slate-50/70 border border-slate-200/70 rounded-2xl p-5 my-4';

  const titleHeader = title
    ? `<h3 class="text-xs font-extrabold ${isChorus ? 'text-violet-900' : 'text-slate-500'} uppercase tracking-wider mb-2">
        ${escapeHtml(title)}
      </h3>`
    : '';

  return `<div class="${cardStyle}">
    ${titleHeader}
    <div class="text-sm sm:text-base ${isChorus ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'} leading-relaxed">
      ${formattedText}
    </div>
  </div>`;
}

function renderNotFoundHtml(searched: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Song Not Found - Favor Church</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen flex items-center justify-center p-4">
  <div class="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 shadow-xl text-center space-y-4">
    <div class="text-4xl">🔍</div>
    <h1 class="text-xl font-bold text-slate-900">Song Not Found</h1>
    <p class="text-xs text-slate-500">Could not find a song matching "${escapeHtml(searched)}" in Rock RMS ContentChannel 18.</p>
    <a href="https://rock.favor.church" target="_blank" class="inline-block bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-xl">Open Rock RMS</a>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
