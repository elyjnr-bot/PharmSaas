import { useId } from 'react';

/**
 * LogoIcon — Astérisque JunglePharm sur fond vert dégradé.
 * Chaque instance génère un id de gradient unique pour éviter
 * les collisions SVG quand le composant est rendu plusieurs fois.
 */
export function LogoIcon({ size = 32, radius }: { size?: number; radius?: number }) {
  const uid = useId().replace(/:/g, '');
  const gid = `jp_grad_${uid}`;
  const r = radius ?? Math.round(size * 0.22); // arrondi proportionnel

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#bcd96e" />
          <stop offset="50%"  stopColor="#96c244" />
          <stop offset="100%" stopColor="#74ab2e" />
        </linearGradient>
      </defs>
      {/* Fond arrondi vert dégradé */}
      <rect width="32" height="32" fill={`url(#${gid})`} rx={r} />
      {/* Astérisque 6 branches : 3 barres tournées 0° / 60° / 120° */}
      <g transform="translate(16,16)" fill="#1a1a1a">
        <rect x="-3.4" y="-11.5" width="6.8" height="23" rx="3.4" />
        <rect x="-3.4" y="-11.5" width="6.8" height="23" rx="3.4" transform="rotate(60)" />
        <rect x="-3.4" y="-11.5" width="6.8" height="23" rx="3.4" transform="rotate(120)" />
      </g>
    </svg>
  );
}

export default LogoIcon;
