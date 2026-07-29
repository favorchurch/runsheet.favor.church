/**
 * Lists the Rock content channels that hold runsheets.
 *
 * Handy for finding the channel id to open in the editor. Run with
 * `pnpm list:channels` — needs ROCK_API_URL and ROCK_API_KEY in `.env.local`.
 *
 * Reads Rock directly rather than through `rockGet`, because that path calls
 * `assertAuthenticated()` and expects a Next.js request context that a plain
 * script does not have.
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

interface ContentChannel {
  Id: number;
  Name: string;
  ContentChannelTypeId: number;
}

async function main() {
  const rockUrl = process.env.ROCK_API_URL || process.env.NEXT_PUBLIC_ROCK_API_URL;
  const rockKey = process.env.ROCK_API_KEY;

  if (!rockUrl || !rockKey) {
    throw new Error('ROCK_API_URL and ROCK_API_KEY must be set (e.g. in .env.local)');
  }

  const response = await fetch(`${rockUrl}/ContentChannels?$select=Id,Name,ContentChannelTypeId`, {
    headers: { 'Authorization-Token': rockKey, Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Rock API error ${response.status}: ${await response.text()}`);
  }

  const channels = (await response.json()) as ContentChannel[];
  const runsheets = channels.filter((channel) => /runsheet|service/i.test(channel.Name ?? ''));

  console.table(runsheets.map(({ Id, Name, ContentChannelTypeId }) => ({ Id, Name, ContentChannelTypeId })));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
