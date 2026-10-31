/** Inline SVG icons (stroke-based, currentColor). Static markup only. */

const PATHS: Record<string, string> = {
  move: '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
  select: '<rect x="3.5" y="3.5" width="17" height="17" rx="1" stroke-dasharray="3 3"/>',
  lasso:
    '<path d="M12 4c4.4 0 8 2.9 8 6.5S16.4 17 12 17s-8-2.9-8-6.5c0-2 1.2-3.8 3-5"/><path d="M7 16.5c0 2 1.3 3.5 3 3.5"/>',
  brush:
    '<path d="M14.5 4.5 20 10 9.5 20.5a2.1 2.1 0 0 1-3 0l-3-3a2.1 2.1 0 0 1 0-3z"/><path d="m13 6 5 5"/><path d="M4 21c1.5 0 2.5-1 2.5-2.5S5.5 16 4 16"/>',
  eraser:
    '<path d="m5 14 7.5-9.5a2 2 0 0 1 2.8-.2l3.4 2.9a2 2 0 0 1 .2 2.8L11 20H5z"/><path d="M4 20h12"/><path d="m10 6.5 6.5 5.5"/>',
  fill: '<path d="m4 11 7-7 7 7-7 7z"/><path d="m8 7 7 7"/><path d="M19 14s2 2.2 2 3.7a2 2 0 0 1-4 0c0-1.5 2-3.7 2-3.7z"/><path d="M4 20h8"/>',
  gradient:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 18h18M3 14h18M3 10h18M3 6h18" opacity=".35"/><path d="M3 19.5h18V21H3z" opacity=".6"/>',
  shape: '<rect x="3" y="3" width="11" height="11" rx="1.5"/><circle cx="16" cy="16" r="5"/>',
  text: '<path d="M5 5h14M12 5v14M9 19h6"/>',
  eyedropper:
    '<path d="m15 4 5 5M17.5 6.5 8 16l-1 4 4-1 9.5-9.5a1.8 1.8 0 0 0 0-2.5l-1.5-1.5a1.8 1.8 0 0 0-2.5 0z"/><path d="m13 8 3 3"/>',
  crop: '<path d="M6 2v16h16M2 6h16v16"/>',
  hand: '<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11M10 11V4.5a1.5 1.5 0 0 1 3 0V11M13 11V6a1.5 1.5 0 0 1 3 0v5M16 10a1.5 1.5 0 0 1 3 0v5.5A6.5 6.5 0 0 1 12.5 22h-1.2a7 7 0 0 1-5.3-2.4L3.4 16a1.6 1.6 0 0 1 2.3-2.2L8 16"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5M7.5 10.5h6M10.5 7.5v6"/>',
  undo: '<path d="M8 5 3 10l5 5"/><path d="M3 10h11a6 6 0 0 1 0 12h-2"/>',
  redo: '<path d="m16 5 5 5-5 5"/><path d="M21 10H10a6 6 0 0 0 0 12h2"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off':
    '<path d="M3 3l18 18"/><path d="M10.6 5.2A11 11 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-3.2 4.1M6.2 6.2A18.3 18.3 0 0 0 2 12s3.6 7 10 7a10.9 10.9 0 0 0 4.4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.7-1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  merge: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5L5 21"/>',
  palette:
    '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.6-.2-1-.6-1.4-.3-.4-.4-.8-.4-1.2 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 22 9.8 9 9 0 0 0 12 3z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5"/><path d="M4 3h16"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  external: '<path d="M14 3h7v7M21 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  keyboard:
    '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 13h6M8 16h8"/>',
};

export function icon(name: string, size = 18): string {
  const path = PATHS[name] ?? PATHS.info;
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export const GITHUB_ICON =
  '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.1 1.7 1.1 1 1.7 2.7 1.2 3.3.9.1-.7.4-1.2.7-1.5-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.5.2 2.7.1 3a4.5 4.5 0 0 1 1.2 3.1c0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z"/></svg>';
