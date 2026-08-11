import type { SVGAttributes } from 'react';
import { cx } from './cx';
import { useUid } from './hooks';

export interface OrnightMarkProps extends Omit<SVGAttributes<SVGSVGElement>, 'children'> {
  size?: number;
  /** Slow glow pulse plus a micro rotation, so the mark reads as alive. */
  animated?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Star geometry                                                              */
/* -------------------------------------------------------------------------- */

const C = 50;

/**
 * One spoke of the starburst: a tapered pointed lozenge that is widest near
 * the centre and closes to a single point at the tip. The flanks are drawn as
 * quadratics with the control point pulled inboard, which gives the very
 * slight concave taper that keeps the star looking cut rather than drawn.
 */
function spoke(angleDeg: number, length: number, halfWidth: number, waist: number): string {
  const a = (angleDeg * Math.PI) / 180;
  // Angle 0 points straight up; positive rotates clockwise.
  const ux = Math.sin(a);
  const uy = -Math.cos(a);
  const px = Math.cos(a);
  const py = Math.sin(a);

  const at = (along: number, across: number): [number, number] => [
    C + ux * along + px * across,
    C + uy * along + py * across,
  ];

  const tip = at(length, 0);
  const left = at(length * waist, -halfWidth);
  const right = at(length * waist, halfWidth);
  const ctlL = at(length * (waist + (1 - waist) * 0.52), -halfWidth * 0.42);
  const ctlR = at(length * (waist + (1 - waist) * 0.52), halfWidth * 0.42);
  const base = at(-halfWidth * 0.5, 0);

  const n = (v: number) => Math.round(v * 1000) / 1000;
  return (
    `M${n(base[0])} ${n(base[1])}` +
    `L${n(left[0])} ${n(left[1])}` +
    `Q${n(ctlL[0])} ${n(ctlL[1])} ${n(tip[0])} ${n(tip[1])}` +
    `Q${n(ctlR[0])} ${n(ctlR[1])} ${n(right[0])} ${n(right[1])}` +
    'Z'
  );
}

/** Four long spokes on the axes, four shorter ones on the diagonals. */
const STAR_PATH = [
  ...[0, 90, 180, 270].map((angle) => spoke(angle, 33, 6.6, 0.24)),
  ...[45, 135, 225, 315].map((angle) => spoke(angle, 23.5, 5, 0.26)),
].join(' ');

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The Ornight app icon, as one self-contained SVG.
 *
 * A squircle-ish rounded square in deep sapphire (lit from the top-left)
 * carrying a geometric eight-pointed starburst in white. The glass depth is
 * four cheap layers: an inner glow, a glossy specular arc across the upper
 * left, a bottom inner shadow, and a rim light on the outer edge.
 *
 * Every gradient id is namespaced per instance, so a splash screen and a
 * sidebar badge can render the mark at the same time without colliding.
 */
export function OrnightMark({ size = 64, animated = false, className, ...rest }: OrnightMarkProps) {
  const uid = useUid('ornight-mark');
  const id = (part: string) => `${uid}-${part}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Ornight"
      className={cx('on-mark', animated && 'on-mark--animated', className)}
      {...rest}
    >
      <defs>
        {/* Body: lighter royal blue at the top-left falling to deep sapphire. */}
        <linearGradient id={id('body')} x1="0.04" y1="0" x2="0.86" y2="1">
          <stop offset="0%" stopColor="#5b86f7" />
          <stop offset="28%" stopColor="#3a63e2" />
          <stop offset="64%" stopColor="#2340b4" />
          <stop offset="100%" stopColor="#111c62" />
        </linearGradient>

        {/* Inner glow, hugging the lit corner. */}
        <radialGradient id={id('inner')} cx="0.24" cy="0.14" r="0.92">
          <stop offset="0%" stopColor="#eaf1ff" stopOpacity="0.4" />
          <stop offset="46%" stopColor="#a9c3ff" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#7fa0ff" stopOpacity="0" />
        </radialGradient>

        {/* The glossy arc across the upper-left. */}
        <linearGradient id={id('spec')} x1="0" y1="0" x2="0.72" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="52%" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* Inner shadow pooling along the bottom edge. */}
        <linearGradient id={id('floor')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#03071c" stopOpacity="0" />
          <stop offset="100%" stopColor="#03071c" stopOpacity="0.5" />
        </linearGradient>

        {/* Soft bloom behind the star. */}
        <radialGradient id={id('bloom')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#dce8ff" stopOpacity="0.55" />
          <stop offset="42%" stopColor="#9db9ff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#7ea0ff" stopOpacity="0" />
        </radialGradient>

        {/* The star itself: white, cooling very slightly toward the bottom. */}
        <linearGradient id={id('star')} x1="0.2" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="58%" stopColor="#f4f8ff" />
          <stop offset="100%" stopColor="#d5e3ff" />
        </linearGradient>

        <clipPath id={id('clip')}>
          <rect x="0" y="0" width="100" height="100" rx="22" ry="22" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${id('clip')})`}>
        <rect x="0" y="0" width="100" height="100" fill={`url(#${id('body')})`} />
        <rect x="0" y="0" width="100" height="100" fill={`url(#${id('inner')})`} />

        {/* Specular arc: bounded above by the top edge, below by a soft curve. */}
        <path d="M0 0 H100 V22 C72 42 26 38 0 17 Z" fill={`url(#${id('spec')})`} />

        {/* Bottom inner shadow. */}
        <rect x="0" y="52" width="100" height="48" fill={`url(#${id('floor')})`} />

        <g className={animated ? 'on-mark__pulse' : undefined}>
          <circle cx="50" cy="50" r="42" fill={`url(#${id('bloom')})`} />
        </g>

        <path
          d={STAR_PATH}
          fill={`url(#${id('star')})`}
          fillRule="nonzero"
          stroke="#ffffff"
          strokeWidth="0.4"
          strokeOpacity="0.5"
        />
        {/* Solid heart, so the eight spokes meet rather than merely overlap. */}
        <circle cx="50" cy="50" r="6.4" fill={`url(#${id('star')})`} />

        {/* Inner shadow ring — the clip hides its outer half. */}
        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          rx="22"
          ry="22"
          fill="none"
          stroke="#040a24"
          strokeOpacity="0.35"
          strokeWidth="3"
        />
      </g>

      {/* Rim light on the outer edge. */}
      <rect
        x="0.6"
        y="0.6"
        width="98.8"
        height="98.8"
        rx="21.6"
        ry="21.6"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.3"
        strokeWidth="1.2"
      />
    </svg>
  );
}
