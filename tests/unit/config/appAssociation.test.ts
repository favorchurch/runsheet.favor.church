import fs from 'fs';
import path from 'path';
import { config as middlewareConfig } from '@/middleware';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nextConfig = require('../../../next.config.js');

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
    expect(links[0].target.sha256_cert_fingerprints).toHaveLength(2);
  });

  it('serves the AASA file as application/json', async () => {
    const rules: Array<{ source: string; headers: Array<{ key: string; value: string }> }> =
      await nextConfig.headers();
    const rule = rules.find((r) => r.source === '/.well-known/apple-app-site-association');
    expect(rule?.headers).toContainEqual({ key: 'Content-Type', value: 'application/json' });
  });

  it('keeps .well-known out of the middleware matcher so it is never redirected', () => {
    const matcher = new RegExp(`^${middlewareConfig.matcher[0]}$`);
    expect(matcher.test('/.well-known/apple-app-site-association')).toBe(false);
    expect(matcher.test('/.well-known/assetlinks.json')).toBe(false);
    expect(matcher.test('/runsheet')).toBe(true);
  });
});
