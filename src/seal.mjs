// Generates a round rubber-stamp style company seal as an SVG string.
const esc = (s = '') =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let uid = 0;
export function sealSvg({
  topText = 'COMPANY NAME',
  bottomText = 'AUTHORISED SIGNATORY',
  centerText = '★',
  centerSubText = '',
  color = '#1F3A93',
} = {}) {
  const id = `s${++uid}`; // unique per seal: several seals can share one page
  // Shrink font a little for long strings so they stay within the half-circle.
  const fit = (text, base, arcLen) => Math.min(base, (arcLen / Math.max(text.length, 1)) * 1.25);
  const topSize = fit(topText, 15, Math.PI * 76);
  const botSize = fit(bottomText, 13, Math.PI * 88);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" class="seal-svg">
  <defs>
    <path id="sealTop-${id}" d="M 24,100 A 76,76 0 0 1 176,100" />
    <path id="sealBot-${id}" d="M 12,100 A 88,88 0 0 0 188,100" />
    <filter id="ink-${id}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/>
      <feDisplacementMap in="SourceGraphic" scale="1.6"/></filter>
  </defs>
  <g fill="none" stroke="${color}" filter="url(#ink-${id})">
    <circle cx="100" cy="100" r="96" stroke-width="3.5"/>
    <circle cx="100" cy="100" r="91" stroke-width="1"/>
    <circle cx="100" cy="100" r="62" stroke-width="1.6"/>
  </g>
  <g fill="${color}" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="700" filter="url(#ink-${id})">
    <text font-size="${topSize.toFixed(1)}" letter-spacing="1.2" text-anchor="middle">
      <textPath href="#sealTop-${id}" startOffset="50%">${esc(topText)}</textPath></text>
    <text font-size="${botSize.toFixed(1)}" letter-spacing="1.2" text-anchor="middle">
      <textPath href="#sealBot-${id}" startOffset="50%">${esc(bottomText)}</textPath></text>
    <text x="14" y="104.5" font-size="11" text-anchor="middle">★</text>
    <text x="186" y="104.5" font-size="11" text-anchor="middle">★</text>
    <text x="100" y="${centerSubText ? 104 : 112}" font-size="30" text-anchor="middle">${esc(centerText)}</text>
    ${centerSubText ? `<text x="100" y="126" font-size="11" letter-spacing="2" text-anchor="middle">${esc(centerSubText)}</text>` : ''}
  </g>
</svg>`;
}
