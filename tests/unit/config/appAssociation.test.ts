import fs from 'fs';
import path from 'path';
import { config as middlewareConfig } from '@/middleware';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nextConfig = require('../../../next.config.js');

// Next's own matcher compiler. It is internal, so its types do not export it.
type CompiledMatcher = { regexp: string };
const { getMiddlewareMatchers } = require('next/dist/build/analysis/get-page-static-info') as {
  getMiddlewareMatchers: (matcher: unknown, config: Record<string, unknown>) => CompiledMatcher[];
};

const wellKnown = path.join(__dirname, '../../../public/.well-known');

describe('Favor App association files', () => {
  it('AASA lists only webcredentials for the Favor App', () => {
    const aasa = JSON.parse(fs.readFileSync(path.join(wellKnown, 'apple-app-site-association'), 'utf8'));
    expect(aasa).toEqual({ webcredentials: { apps: ['3JJ4492TV8.church.favor.app.ios'] } });
  });

  it('assetlinks targets church.favor.app with the two release fingerprints', () => {
    const links = JSON.parse(fs.readFileSync(path.join(wellKnown, 'assetlinks.json'), 'utf8'));
    expect(links).toHaveLength(1);
    expect(links[0].relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(links[0].target.namespace).toBe('android_app');
    expect(links[0].target.package_name).toBe('church.favor.app');
    // Play App Signing and upload certificates, as in rock-mobile-app web-association.
    expect(links[0].target.sha256_cert_fingerprints).toEqual([
      '8E:08:4B:30:1E:DD:7E:15:BC:54:C8:2A:78:9D:69:BF:02:69:9B:09:62:CD:9C:85:08:6D:68:8A:93:9A:21:BE',
      '54:E7:AC:EB:92:70:8D:34:BD:B7:C0:E1:1B:A3:84:0A:1D:B2:C6:58:57:5C:7F:E8:F8:66:48:5C:20:45:82:79',
    ]);
  });

  it('serves the AASA file as application/json', async () => {
    const rules: Array<{ source: string; headers: Array<{ key: string; value: string }> }> =
      await nextConfig.headers();
    const rule = rules.find((r) => r.source === '/.well-known/apple-app-site-association');
    expect(rule?.headers).toContainEqual({ key: 'Content-Type', value: 'application/json' });
  });

  it('keeps .well-known out of the middleware matcher so it is never redirected', () => {
    // Compile the matcher the way Next does, not with a hand-built RegExp.
    const [compiled] = getMiddlewareMatchers(middlewareConfig.matcher, {});
    const matcher = new RegExp(compiled.regexp);
    expect(matcher.test('/.well-known/apple-app-site-association')).toBe(false);
    expect(matcher.test('/.well-known/assetlinks.json')).toBe(false);
    expect(matcher.test('/runsheet')).toBe(true);
  });
});
