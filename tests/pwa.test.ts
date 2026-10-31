import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import iconSvg from '../public/icon.svg?raw';
import manifestText from '../public/manifest.webmanifest?raw';
import serviceWorker from '../public/sw.js?raw';

describe('installable offline app', () => {
  const manifest = JSON.parse(manifestText) as Record<string, unknown>;

  it('declares a valid web app manifest', () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('ships at least one icon that resolves inside the app scope', () => {
    const icons = manifest.icons as Array<{ src: string; type: string }>;
    expect(icons.length).toBeGreaterThan(0);
    const icon = icons[0];
    expect(icon.type).toBe('image/svg+xml');
    expect(icon.src.startsWith('/')).toBe(false);
    expect(iconSvg).toContain('<svg');
  });

  it('links the manifest from the page', () => {
    expect(indexHtml).toContain('rel="manifest"');
    expect(indexHtml).toContain('manifest.webmanifest');
  });

  it('registers a service worker that caches the shell and assets', () => {
    expect(serviceWorker).toContain("addEventListener('install'");
    expect(serviceWorker).toContain("addEventListener('fetch'");
    expect(serviceWorker).toContain("addEventListener('activate'");
    expect(serviceWorker).toContain('skipWaiting');
    expect(serviceWorker).toContain('clients.claim');
    // Hashed build output must be cached, and navigations must work offline.
    expect(serviceWorker).toContain('/assets/');
    expect(serviceWorker).toMatch(/navigate/);
  });

  it('only registers the worker from production builds', async () => {
    const main = await import('../src/main.ts?raw');
    expect(main.default).toContain('serviceWorker');
    expect(main.default).toContain('import.meta.env.PROD');
  });
});
