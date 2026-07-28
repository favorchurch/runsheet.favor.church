import { rockGet } from './src/server-actions/internal/rockFetch';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function main() {
  const channels = await rockGet('/ContentChannels?$select=Id,Name,ContentChannelTypeId');
  console.log(channels.filter((c: any) => c.Name.includes('Runsheet') || c.Name.includes('Service')));
}
main();
