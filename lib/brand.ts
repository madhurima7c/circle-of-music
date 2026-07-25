/**
 * The Circle of Music mark, as a standalone SVG string.
 *
 * Kept here (rather than read off disk) so the generated icons and the Open
 * Graph card can embed it without a runtime file read — image routes render
 * on the server at build time, and inlining keeps them dependency-free.
 * Geometry: the 8-square mark supplied by the user (also app/icon.svg).
 */
export function circleMarkSvg(color = '#737CF4'): string {
  const r = (attrs: string) => `<rect ${attrs} fill="${color}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 938 938" fill="none">${[
    r('x="379" width="180" height="180"'),
    r('x="726.994" y="77.8695" width="180" height="180" transform="rotate(45 726.994 77.8695)"'),
    r('x="379" y="758" width="180" height="180"'),
    r('x="191.006" y="613.856" width="180" height="180" transform="rotate(45 191.006 613.856)"'),
    r('x="758" y="379" width="180" height="180"'),
    r('x="726.994" y="613.856" width="180" height="180" transform="rotate(45 726.994 613.856)"'),
    r('y="379" width="180" height="180"'),
    r('x="191.006" y="77.8694" width="180" height="180" transform="rotate(45 191.006 77.8694)"'),
  ].join('')}</svg>`;
}

/** The mark as a data URI, for <img> inside ImageResponse (Satori). */
export function circleMarkDataUri(color?: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(circleMarkSvg(color))}`;
}
