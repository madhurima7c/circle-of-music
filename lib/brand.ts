/**
 * The Circle of Music mark, as a standalone SVG string.
 *
 * Kept here (rather than read off disk) so the generated icons and the Open
 * Graph card can embed it without a runtime file read — image routes render
 * on the server at build time, and inlining keeps them dependency-free.
 * Source of truth for the geometry: public/icons/nav-circle.svg.
 */
export function circleMarkSvg(color = '#1D2BDF'): string {
  const r = (attrs: string) => `<rect ${attrs} fill="${color}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" fill="none">${[
    r('x="15" width="4" height="4"'),
    r('x="8.56134" y="2.10742" width="4" height="4" transform="rotate(-22.8275 8.56134 2.10742)"'),
    r('x="27.6066" y="3.56494" width="4" height="4" transform="rotate(45 27.6066 3.56494)"'),
    r('x="21.5636" y="0.502319" width="4" height="4" transform="rotate(22.1725 21.5636 0.502319)"'),
    r('y="19" width="4" height="4" transform="rotate(-90 0 19)"'),
    r('x="2.10742" y="25.4387" width="4" height="4" transform="rotate(-112.828 2.10742 25.4387)"'),
    r('x="3.56494" y="6.39343" width="4" height="4" transform="rotate(-45 3.56494 6.39343)"'),
    r('x="0.502258" y="12.4364" width="4" height="4" transform="rotate(-67.8275 0.502258 12.4364)"'),
    r('x="15" y="30" width="4" height="4"'),
    r('x="20.2001" y="29.7578" width="4" height="4" transform="rotate(-22.8275 20.2001 29.7578)"'),
    r('x="6.39337" y="24.7782" width="4" height="4" transform="rotate(45 6.39337 24.7782)"'),
    r('x="10.2418" y="28.2838" width="4" height="4" transform="rotate(22.1725 10.2418 28.2838)"'),
    r('x="30" y="19" width="4" height="4" transform="rotate(-90 30 19)"'),
    r('x="29.7577" y="13.7998" width="4" height="4" transform="rotate(-112.828 29.7577 13.7998)"'),
    r('x="24.7782" y="27.6066" width="4" height="4" transform="rotate(-45 24.7782 27.6066)"'),
    r('x="28.2839" y="23.7583" width="4" height="4" transform="rotate(-67.8275 28.2839 23.7583)"'),
  ].join('')}</svg>`;
}

/** The mark as a data URI, for <img> inside ImageResponse (Satori). */
export function circleMarkDataUri(color?: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(circleMarkSvg(color))}`;
}
