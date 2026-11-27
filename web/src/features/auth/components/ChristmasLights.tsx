/**
 * A string of Christmas lights across the top of the app chooser.
 *
 * Seasonal decoration, not information: the whole strip is `aria-hidden` and
 * pointer-transparent, so it never competes with the header's brand, theme
 * switch or sign-out. The artwork is the supplied 1358×52 garland: a dotted
 * wire with five sags, and twenty hanging bulbs, each with a glass teardrop,
 * filament, silver screw base and navy band. Coordinates and rotations are kept
 * in the source space so the drawing can be compared against the original file.
 *
 * Every glass carries `.xmas-bulb` (see `styles.css`): it steps through the six
 * supplied colours, and the per-bulb `animation-delay` starts each one at a
 * different point in the cycle, so the string shimmers rather than blinking in
 * unison. Reduced motion turns the animation off and leaves the static colours.
 *
 * The wire paints in `currentColor` so it still reads in dark mode, where the
 * original dark sage would disappear into the page. The bulbs keep their own
 * colours, including the navy band, like the printed sheets' fixed ink.
 *
 * Kept to the chooser only: the login page is the first impression and the app
 * shells are working surfaces, while the chooser is the one screen whose whole
 * job is "pick where to go" and can carry the greeting.
 */
import { cn } from "@/lib/utils";

/** One bulb: group position in the 1358×52 source space, its tilt, cycle start. */
type Bulb = { x: number; y: number; angle: number; delay: string; color: string };

const BULBS: Bulb[] = [
  { x: 40.8, y: 13.6, angle: -20, delay: "0.00s", color: "#febb2c" },
  { x: 102, y: 18.8, angle: 16, delay: "-3.00s", color: "#204584" },
  { x: 170, y: 21, angle: -24, delay: "-2.40s", color: "#f0509c" },
  { x: 238, y: 19.6, angle: 14, delay: "-1.80s", color: "#6bbe44" },
  { x: 299.2, y: 15.1, angle: -18, delay: "-1.20s", color: "#da1f23" },
  { x: 380.8, y: 15.1, angle: 22, delay: "-0.60s", color: "#09bbd2" },
  { x: 442, y: 19.7, angle: -14, delay: "0.00s", color: "#febb2c" },
  { x: 510, y: 21.5, angle: 18, delay: "-3.00s", color: "#204584" },
  { x: 578, y: 19.7, angle: -22, delay: "-2.40s", color: "#f0509c" },
  { x: 639.2, y: 15.1, angle: 12, delay: "-1.80s", color: "#6bbe44" },
  { x: 720.8, y: 15.1, angle: -16, delay: "-1.20s", color: "#da1f23" },
  { x: 782, y: 19.7, angle: 24, delay: "-0.60s", color: "#09bbd2" },
  { x: 850, y: 21.5, angle: -12, delay: "0.00s", color: "#febb2c" },
  { x: 918, y: 19.7, angle: 20, delay: "-3.00s", color: "#204584" },
  { x: 979.2, y: 15.1, angle: -24, delay: "-2.40s", color: "#f0509c" },
  { x: 1060.8, y: 15.1, angle: 14, delay: "-1.80s", color: "#6bbe44" },
  { x: 1122, y: 19.6, angle: -18, delay: "-1.20s", color: "#da1f23" },
  { x: 1190, y: 21, angle: 22, delay: "-0.60s", color: "#09bbd2" },
  { x: 1258, y: 18.8, angle: -14, delay: "0.00s", color: "#febb2c" },
  { x: 1319.2, y: 13.6, angle: 18, delay: "-3.00s", color: "#204584" },
];

/** The wire: four shallow sags between the two outer attachment points. */
const WIRE_PATH = "M0 10 Q170 34 340 12 Q510 34 680 12 Q850 34 1020 12 Q1190 34 1360 10";

/** The glass teardrop, hanging from the bulb's origin (the screw base). */
const GLASS_PATH = "M-4.6 6.5C-8 10-7.6 17 0 27C7.6 17 8 10 4.6 6.5Z";

export function ChristmasLights({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        // Clipped, centred and never narrower than the artwork on phones: the
        // string runs off both edges the way a real garland does, instead of
        // shrinking its bulbs into specks. From 1100px up it stretches to fill.
        "pointer-events-none absolute inset-x-0 top-0 flex h-[52px] justify-center overflow-hidden select-none",
        className,
      )}
    >
      <svg
        viewBox="0 0 1358 52"
        preserveAspectRatio="none"
        fill="none"
        className="h-[52px] w-full min-w-[1100px] shrink-0 text-[#46544c] dark:text-white/35"
      >
        <path
          d={WIRE_PATH}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray="0.1 3.2"
          vectorEffect="non-scaling-stroke"
        />

        {BULBS.map((bulb) => (
          <g
            key={`${bulb.x}-${bulb.y}`}
            transform={`translate(${bulb.x} ${bulb.y}) rotate(${bulb.angle})`}
          >
            <path
              className="xmas-bulb"
              style={{ animationDelay: bulb.delay }}
              fill={bulb.color}
              d={GLASS_PATH}
            />
            {/* Filament: two leads and three little coils. */}
            <g
              fill="none"
              stroke="#fff"
              strokeOpacity={0.9}
              strokeWidth={0.7}
              strokeLinecap="round"
            >
              <path d="M-1.3 8L-3.5 16.4M1.3 8L3.5 16.4" />
              <circle cx={-2.2} cy={16} r={1.1} />
              <circle cx={0} cy={16.3} r={1.1} />
              <circle cx={2.2} cy={16} r={1.1} />
            </g>
            {/* Screw base, then the navy collar over its bottom edge. */}
            <path d="M-3.6 0H3.6L4.4 7H-4.4Z" fill="#8b9ec0" />
            <path d="M-4.5 5.6H4.5L4.7 7.8H-4.7Z" fill="#204584" />
          </g>
        ))}
      </svg>
    </div>
  );
}
