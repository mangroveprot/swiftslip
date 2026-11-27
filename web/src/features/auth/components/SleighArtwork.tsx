/**
 * The supplied "reindeer sleigh with gas-cylinder mascot" artwork.
 *
 * Kept as one drawing so the SVG can be compared against the owner's file: the
 * sleigh with the REGASCO cylinder mascot on the left, three reindeer pulling it
 * to the right, and the rein that runs between them. Every group carries the
 * SMIL bob and leg-swing the artwork shipped with, so the team gallops in place
 * while `SleighRide` slides the whole scene across the garland.
 *
 * The only additions are the two pupil refs: the iris, pupil and highlight of
 * each eye are wrapped so `usePointerGaze` can aim them at the cursor.
 */
import type { RefObject } from "react";

/** The rein's morph keyframes, shared by its dark and gold strokes. */
const REINS_D =
  "M320 206 L361 203.7 L415 203.7 L456 201.8 L510 201.8 L551 199 L605 199;M320 205.9 L361 204 L415 204 L456 202.8 L510 202.8 L551 200.3 L605 200.3;M320 205.5 L361 203.9 L415 203.9 L456 203.5 L510 203.5 L551 201.5 L605 201.5;M320 204.8 L361 203.6 L415 203.6 L456 203.9 L510 203.9 L551 202.5 L605 202.5;M320 203.8 L361 202.9 L415 202.9 L456 204 L510 204 L551 203.3 L605 203.3;M320 202.6 L361 202 L415 202 L456 203.7 L510 203.7 L551 203.8 L605 203.8;M320 201.4 L361 200.8 L415 200.8 L456 203.1 L510 203.1 L551 204 L605 204;M320 200.1 L361 199.5 L415 199.5 L456 202.3 L510 202.3 L551 203.8 L605 203.8;M320 198.8 L361 198.2 L415 198.2 L456 201.2 L510 201.2 L551 203.3 L605 203.3;M320 197.7 L361 197 L415 197 L456 199.9 L510 199.9 L551 202.5 L605 202.5;M320 196.9 L361 195.9 L415 195.9 L456 198.6 L510 198.6 L551 201.5 L605 201.5;M320 196.3 L361 195 L415 195 L456 197.3 L510 197.3 L551 200.3 L605 200.3;M320 196 L361 194.3 L415 194.3 L456 196.2 L510 196.2 L551 199 L605 199;M320 196.1 L361 194 L415 194 L456 195.2 L510 195.2 L551 197.7 L605 197.7;M320 196.5 L361 194.1 L415 194.1 L456 194.5 L510 194.5 L551 196.5 L605 196.5;M320 197.2 L361 194.4 L415 194.4 L456 194.1 L510 194.1 L551 195.5 L605 195.5;M320 198.2 L361 195.1 L415 195.1 L456 194 L510 194 L551 194.7 L605 194.7;M320 199.4 L361 196 L415 196 L456 194.3 L510 194.3 L551 194.2 L605 194.2;M320 200.6 L361 197.2 L415 197.2 L456 194.9 L510 194.9 L551 194 L605 194;M320 201.9 L361 198.5 L415 198.5 L456 195.7 L510 195.7 L551 194.2 L605 194.2;M320 203.2 L361 199.8 L415 199.8 L456 196.8 L510 196.8 L551 194.7 L605 194.7;M320 204.3 L361 201 L415 201 L456 198.1 L510 198.1 L551 195.5 L605 195.5;M320 205.1 L361 202.1 L415 202.1 L456 199.4 L510 199.4 L551 196.5 L605 196.5;M320 205.7 L361 203 L415 203 L456 200.7 L510 200.7 L551 197.7 L605 197.7;M320 206 L361 203.7 L415 203.7 L456 201.8 L510 201.8 L551 199 L605 199";

export function SleighArtwork({
  leftPupil,
  rightPupil,
}: {
  leftPupil: RefObject<SVGGElement | null>;
  rightPupil: RefObject<SVGGElement | null>;
}) {
  return (
    <>
      <g transform="translate(165,219)">
        <animateTransform
          attributeName="transform"
          type="translate"
          values="165 219;165 218.9;165 218.5;165 217.8;165 216.8;165 215.6;165 214.4;165 213.1;165 211.8;165 210.7;165 209.9;165 209.3;165 209;165 209.1;165 209.5;165 210.2;165 211.2;165 212.4;165 213.6;165 214.9;165 216.2;165 217.3;165 218.1;165 218.7;165 219"
          dur="1.2s"
          repeatCount="indefinite"
        />
        <polyline
          points="-20,34 135,34 150,26 152,18"
          fill="none"
          stroke="#ffcd46"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="20,34 20,20"
          fill="none"
          stroke="#ffcd46"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="110,34 110,20"
          fill="none"
          stroke="#ffcd46"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polygon points="-18,-6 138,-6 150,-18 158,-18 150,14 120,28 10,28 -12,10" fill="#cd2630" />
        <polygon points="-12,10 10,28 120,28 150,14 148,8 -10,4" fill="#8c1420" />
        <polyline
          points="-14,4 148,4"
          fill="none"
          stroke="#ffcd46"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <ellipse cx="70" cy="-6" rx="70" ry="6" fill="#690e1a" />
        <rect x="-3" y="-8" width="26" height="6" rx="2" fill="#b04016" />
        <ellipse cx="10" cy="-10" rx="17" ry="6" fill="#b04016" />
        <rect x="-7" y="-42" width="34" height="32" rx="0" fill="#f26c28" />
        <ellipse cx="10" cy="-10" rx="17" ry="5" fill="#f26c28" />
        <ellipse cx="10" cy="-42" rx="17" ry="13" fill="#f26c28" />
        <ellipse cx="10" cy="-38" rx="17" ry="3" fill="#b04016" />
        <rect x="-1" y="-33" width="5" height="19" rx="2" fill="#ff9955" />
        <text
          x="10"
          y="-25.4"
          fontFamily="'DejaVu Sans Condensed','Arial Narrow',Arial,Helvetica,sans-serif"
          fontWeight="700"
          fontSize="7.8"
          fill="#1e46cd"
          textAnchor="middle"
          textLength="27"
          lengthAdjust="spacingAndGlyphs"
        >
          REGASCO
        </text>
        <rect x="-3" y="-23" width="26" height="1.2" rx="0" fill="#1e46cd" />
        <rect x="4" y="-60" width="12" height="12" rx="0" fill="#f26c28" />
        <rect
          x="-0.7"
          y="-62.7"
          width="21.4"
          height="9.4"
          rx="4"
          fill="none"
          stroke="#b04016"
          strokeWidth="2.6"
        />
        <rect x="7" y="-64" width="6" height="12" rx="1" fill="#f0be3c" />
        <circle cx="10" cy="-66" r="4.2" fill="#f0be3c" />
        <rect x="12" y="-60" width="6" height="3" rx="1" fill="#f0be3c" />
        <polyline
          points="155,-13 123,-27 49,-27 41,-14"
          fill="none"
          stroke="#3c2412"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="155,-13 123,-27 49,-27 41,-14"
          fill="none"
          stroke="#ffd664"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="65,-38 55,-34 50,-28"
          fill="none"
          stroke="#60260c"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="65,-38 55,-34 50,-28"
          fill="none"
          stroke="#f26c28"
          strokeWidth="6.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="107,-38 117,-34 122,-28"
          fill="none"
          stroke="#60260c"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="107,-38 117,-34 122,-28"
          fill="none"
          stroke="#f26c28"
          strokeWidth="6.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <ellipse cx="86" cy="-11" rx="27.5" ry="10.5" fill="#60260c" />
        <rect x="58.5" y="-28" width="55" height="17" rx="0" fill="#60260c" />
        <rect x="60.5" y="-54" width="51" height="26" rx="0" fill="#60260c" />
        <ellipse cx="86" cy="-54" rx="25.5" ry="19.5" fill="#60260c" />
        <ellipse cx="86" cy="-11" rx="26" ry="9" fill="#b04016" />
        <rect x="60" y="-28" width="52" height="17" rx="0" fill="#f26c28" />
        <rect x="62" y="-54" width="48" height="26" rx="0" fill="#f26c28" />
        <ellipse cx="86" cy="-54" rx="24" ry="18" fill="#f26c28" />
        <rect x="63" y="-12" width="46" height="8" rx="3" fill="#b04016" />
        <ellipse cx="86" cy="-4" rx="23" ry="5" fill="#b04016" />
        <ellipse cx="86" cy="-58" rx="22" ry="3" fill="#b04016" />
        <rect x="65" y="-48" width="6" height="30" rx="3" fill="#ffa05c" />
        <rect x="78" y="-78" width="16" height="14" rx="1" fill="#f26c28" />
        <rect
          x="72.9"
          y="-82.1"
          width="26.2"
          height="14.2"
          rx="6"
          fill="none"
          stroke="#60260c"
          strokeWidth="3.8"
        />
        <rect
          x="72"
          y="-83"
          width="27.9"
          height="15.9"
          rx="6"
          fill="none"
          stroke="#b04016"
          strokeWidth="2.1"
        />
        <rect x="81.5" y="-85" width="9" height="21" rx="1.5" fill="#787a80" />
        <rect x="81.5" y="-85" width="3" height="21" rx="1" fill="#b4b6bc" />
        <circle cx="86" cy="-74" r="3.4" fill="#46484e" />
        <rect x="80" y="-88" width="12" height="6" rx="2" fill="#5f6268" />
        <circle cx="76.5" cy="-39" r="10.2" fill="#281914" />
        <circle cx="76.5" cy="-39" r="9" fill="#ffffff" />
        <g ref={leftPupil}>
          <circle cx="78.3" cy="-42" r="5.2" fill="#6e788c" />
          <circle cx="78.5" cy="-42.4" r="3" fill="#0c0c0c" />
          <circle cx="77.1" cy="-44" r="1.6" fill="#ffffff" />
        </g>
        <circle cx="96.5" cy="-39" r="10.2" fill="#281914" />
        <circle cx="96.5" cy="-39" r="9" fill="#ffffff" />
        <g ref={rightPupil}>
          <circle cx="98.3" cy="-42" r="5.2" fill="#6e788c" />
          <circle cx="98.5" cy="-42.4" r="3" fill="#0c0c0c" />
          <circle cx="97.1" cy="-44" r="1.6" fill="#ffffff" />
        </g>
        <path
          d="M95 -24.5 A9 8.5 0 0 1 77 -24.5 Z"
          fill="#961a20"
          stroke="#370e0e"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <ellipse cx="86" cy="-20.5" rx="4.6" ry="2.6" fill="#f05c68" />
        <ellipse cx="123" cy="-27" rx="10" ry="8.6" fill="#0a1a60" />
        <ellipse cx="123" cy="-27" rx="8.7" ry="7.3" fill="#1e46cd" />
        <ellipse cx="121" cy="-30" rx="3" ry="1.8" fill="#6ea0ff" />
        <polyline
          points="119,-26.5 119,-21.5"
          fill="none"
          stroke="#0a1a60"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="123,-26.5 123,-21.5"
          fill="none"
          stroke="#0a1a60"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="127,-26.5 127,-21.5"
          fill="none"
          stroke="#0a1a60"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <ellipse cx="124" cy="-35" rx="3.8" ry="3" fill="#0a1a60" />
        <ellipse cx="124" cy="-35" rx="2.8" ry="2.1" fill="#1e46cd" />
        <ellipse cx="49" cy="-27" rx="10" ry="8.6" fill="#0a1a60" />
        <ellipse cx="49" cy="-27" rx="8.7" ry="7.3" fill="#1e46cd" />
        <ellipse cx="47" cy="-30" rx="3" ry="1.8" fill="#6ea0ff" />
        <polyline
          points="45,-26.5 45,-21.5"
          fill="none"
          stroke="#0a1a60"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="49,-26.5 49,-21.5"
          fill="none"
          stroke="#0a1a60"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="53,-26.5 53,-21.5"
          fill="none"
          stroke="#0a1a60"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <ellipse cx="48" cy="-35" rx="3.8" ry="3" fill="#0a1a60" />
        <ellipse cx="48" cy="-35" rx="2.8" ry="2.1" fill="#1e46cd" />
        <polygon points="-17,-3 139,-3 147,-12 150,-6 148,4 -12,4" fill="#cd2630" />
        <polyline
          points="-16,-3 139,-3"
          fill="none"
          stroke="#ffcd46"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="155" cy="-13" r="4.2" fill="#ffcd46" />
        <circle cx="155" cy="-13" r="2.2" fill="#690e1a" />
      </g>
      <g transform="translate(585,200)">
        <animateTransform
          attributeName="transform"
          type="translate"
          values="585 200;585 201.3;585 202.5;585 203.5;585 204.3;585 204.8;585 205;585 204.8;585 204.3;585 203.5;585 202.5;585 201.3;585 200;585 198.7;585 197.5;585 196.5;585 195.7;585 195.2;585 195;585 195.2;585 195.7;585 196.5;585 197.5;585 198.7;585 200"
          dur="1.2s"
          repeatCount="indefinite"
        />
        <g transform="translate(22,12)">
          <g transform="rotate(-0)">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="-0;11.1;21.5;30.4;37.2;41.5;43;41.5;37.2;30.4;21.5;11.1;0;-11.1;-21.5;-30.4;-37.2;-41.5;-43;-41.5;-37.2;-30.4;-21.5;-11.1;-0"
              dur="1.2s"
              repeatCount="indefinite"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="16"
              stroke="#704628"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="0" cy="16" r="2.6" fill="#704628" />
            <g transform="translate(0,16)">
              <g transform="rotate(59.6)">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="59.6;56;51.4;46.1;40.5;35;29.9;25.6;22.4;20.5;20.1;21.1;23.5;27.1;31.7;37;42.6;48.1;53.1;57.4;60.6;62.5;63;62;59.6"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="16"
                  stroke="#704628"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="16" r="3.2" fill="#2d1e19" />
              </g>
            </g>
          </g>
        </g>
        <g transform="translate(-24,12)">
          <g transform="rotate(-25.3)">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="-25.3;-15.4;-4.5;6.7;17.5;27;34.8;40.1;42.7;42.4;39.3;33.4;25.3;15.4;4.5;-6.7;-17.5;-27;-34.8;-40.1;-42.7;-42.4;-39.3;-33.4;-25.3"
              dur="1.2s"
              repeatCount="indefinite"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="16"
              stroke="#704628"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="0" cy="16" r="2.6" fill="#704628" />
            <g transform="translate(0,16)">
              <g transform="rotate(63)">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="63;62.6;60.7;57.6;53.3;48.3;42.8;37.2;31.9;27.2;23.6;21.1;20.1;20.5;22.3;25.5;29.7;34.8;40.3;45.9;51.2;55.8;59.5;61.9;63"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="16"
                  stroke="#704628"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="16" r="3.2" fill="#2d1e19" />
              </g>
            </g>
          </g>
        </g>
        <ellipse cx="-36" cy="-6" rx="6" ry="5" fill="#faf8f5" />
        <ellipse cx="0" cy="0" rx="38" ry="19" fill="#96623a" />
        <ellipse cx="2" cy="9" rx="28" ry="9" fill="#debe96" />
        <polyline
          points="20,-18 20,18"
          fill="none"
          stroke="#c8232d"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="-8" r="2.2" fill="#ffd246" />
        <circle cx="20" cy="0" r="2.2" fill="#ffd246" />
        <circle cx="20" cy="8" r="2.2" fill="#ffd246" />
        <polygon points="22,-14 36,-40 48,-34 36,4" fill="#96623a" />
        <ellipse cx="46" cy="-40" rx="13" ry="10" fill="#96623a" />
        <ellipse cx="58" cy="-36" rx="8" ry="6" fill="#debe96" />
        <circle cx="63" cy="-37" r="3.4" fill="#e61e28" />
        <circle cx="49" cy="-43" r="2.2" fill="#140f0f" />
        <circle cx="49.7" cy="-43.6" r="0.8" fill="#ffffff" />
        <ellipse cx="38" cy="-46" rx="3.5" ry="7" fill="#784c2c" />
        <polyline
          points="42,-48 38,-64 41,-74"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="39,-60 30,-68"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="40,-68 48,-74"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="47,-48 44.5,-64 46,-74"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="44,-60 35,-68"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="45,-68 53,-74"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g transform="translate(24,12)">
          <g transform="rotate(-0)">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="-0;-11.1;-21.5;-30.4;-37.2;-41.5;-43;-41.5;-37.2;-30.4;-21.5;-11.1;-0;11.1;21.5;30.4;37.2;41.5;43;41.5;37.2;30.4;21.5;11.1;0"
              dur="1.2s"
              repeatCount="indefinite"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="16"
              stroke="#96623a"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="0" cy="16" r="2.6" fill="#96623a" />
            <g transform="translate(0,16)">
              <g transform="rotate(23.5)">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="23.5;27.1;31.7;37;42.6;48.1;53.1;57.4;60.6;62.5;63;62;59.6;56;51.4;46.1;40.5;35;29.9;25.6;22.4;20.5;20.1;21.1;23.5"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="16"
                  stroke="#96623a"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="16" r="3.2" fill="#2d1e19" />
              </g>
            </g>
          </g>
        </g>
        <g transform="translate(-22,12)">
          <g transform="rotate(-25.3)">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="-25.3;-33.4;-39.3;-42.4;-42.7;-40.1;-34.8;-27;-17.5;-6.7;4.5;15.4;25.3;33.4;39.3;42.4;42.7;40.1;34.8;27;17.5;6.7;-4.5;-15.4;-25.3"
              dur="1.2s"
              repeatCount="indefinite"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="16"
              stroke="#96623a"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="0" cy="16" r="2.6" fill="#96623a" />
            <g transform="translate(0,16)">
              <g transform="rotate(33.7)">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="33.7;39.2;44.8;50.2;55;58.9;61.6;62.9;62.8;61.2;58.3;54.3;49.3;43.9;38.3;32.9;28.1;24.2;21.5;20.2;20.3;21.9;24.8;28.8;33.7"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="16"
                  stroke="#96623a"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="16" r="3.2" fill="#2d1e19" />
              </g>
            </g>
          </g>
        </g>
      </g>
      <g transform="translate(490,202.8)">
        <animateTransform
          attributeName="transform"
          type="translate"
          values="490 202.8;490 203.8;490 204.5;490 204.9;490 205;490 204.7;490 204.1;490 203.3;490 202.2;490 200.9;490 199.6;490 198.3;490 197.2;490 196.2;490 195.5;490 195.1;490 195;490 195.3;490 195.9;490 196.7;490 197.8;490 199.1;490 200.4;490 201.7;490 202.8"
          dur="1.2s"
          repeatCount="indefinite"
        />
        <g transform="translate(22,12)">
          <g transform="rotate(40.1)">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="40.1;42.7;42.5;39.3;33.5;25.4;15.6;4.7;-6.5;-17.3;-26.9;-34.7;-40.1;-42.7;-42.5;-39.3;-33.5;-25.4;-15.6;-4.7;6.5;17.3;26.9;34.7;40.1"
              dur="1.2s"
              repeatCount="indefinite"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="16"
              stroke="#704628"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="0" cy="16" r="2.6" fill="#704628" />
            <g transform="translate(0,16)">
              <g transform="rotate(37.3)">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="37.3;32;27.3;23.6;21.2;20.1;20.5;22.3;25.4;29.7;34.7;40.2;45.8;51.1;55.8;59.4;61.9;63;62.6;60.8;57.6;53.4;48.4;42.9;37.3"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="16"
                  stroke="#704628"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="16" r="3.2" fill="#2d1e19" />
              </g>
            </g>
          </g>
        </g>
        <g transform="translate(-24,12)">
          <g transform="rotate(23.2)">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="23.2;31.8;38.2;42;42.9;40.9;36.1;28.9;19.7;9.1;-2.1;-13.1;-23.2;-31.8;-38.2;-42;-42.9;-40.9;-36.1;-28.9;-19.7;-9.1;2.1;13.1;23.2"
              dur="1.2s"
              repeatCount="indefinite"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="16"
              stroke="#704628"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="0" cy="16" r="2.6" fill="#704628" />
            <g transform="translate(0,16)">
              <g transform="rotate(50.5)">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="50.5;45.1;39.5;34;29.1;25;22;20.4;20.2;21.4;24;27.9;32.6;38;43.6;49;54;58.1;61.1;62.7;62.9;61.7;59;55.2;50.5"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="16"
                  stroke="#704628"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="16" r="3.2" fill="#2d1e19" />
              </g>
            </g>
          </g>
        </g>
        <ellipse cx="-36" cy="-6" rx="6" ry="5" fill="#faf8f5" />
        <ellipse cx="0" cy="0" rx="38" ry="19" fill="#96623a" />
        <ellipse cx="2" cy="9" rx="28" ry="9" fill="#debe96" />
        <polyline
          points="20,-18 20,18"
          fill="none"
          stroke="#c8232d"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="-8" r="2.2" fill="#ffd246" />
        <circle cx="20" cy="0" r="2.2" fill="#ffd246" />
        <circle cx="20" cy="8" r="2.2" fill="#ffd246" />
        <polygon points="22,-14 36,-40 48,-34 36,4" fill="#96623a" />
        <ellipse cx="46" cy="-40" rx="13" ry="10" fill="#96623a" />
        <ellipse cx="58" cy="-36" rx="8" ry="6" fill="#debe96" />
        <circle cx="63" cy="-37" r="3.4" fill="#321e1e" />
        <circle cx="49" cy="-43" r="2.2" fill="#140f0f" />
        <circle cx="49.7" cy="-43.6" r="0.8" fill="#ffffff" />
        <ellipse cx="38" cy="-46" rx="3.5" ry="7" fill="#784c2c" />
        <polyline
          points="42,-48 38,-64 41,-74"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="39,-60 30,-68"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="40,-68 48,-74"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="47,-48 44.5,-64 46,-74"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="44,-60 35,-68"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="45,-68 53,-74"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g transform="translate(24,12)">
          <g transform="rotate(-40.1)">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="-40.1;-42.7;-42.5;-39.3;-33.5;-25.4;-15.6;-4.7;6.5;17.3;26.9;34.7;40.1;42.7;42.5;39.3;33.5;25.4;15.6;4.7;-6.5;-17.3;-26.9;-34.7;-40.1"
              dur="1.2s"
              repeatCount="indefinite"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="16"
              stroke="#96623a"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="0" cy="16" r="2.6" fill="#96623a" />
            <g transform="translate(0,16)">
              <g transform="rotate(45.8)">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="45.8;51.1;55.8;59.4;61.9;63;62.6;60.8;57.6;53.4;48.4;42.9;37.3;32;27.3;23.6;21.2;20.1;20.5;22.3;25.4;29.7;34.7;40.2;45.8"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="16"
                  stroke="#96623a"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="16" r="3.2" fill="#2d1e19" />
              </g>
            </g>
          </g>
        </g>
        <g transform="translate(-22,12)">
          <g transform="rotate(-41.6)">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="-41.6;-37.3;-30.5;-21.6;-11.3;-0.2;10.9;21.3;30.3;37.1;41.5;43;41.6;37.3;30.5;21.6;11.3;0.2;-10.9;-21.3;-30.3;-37.1;-41.5;-43;-41.6"
              dur="1.2s"
              repeatCount="indefinite"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="16"
              stroke="#96623a"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="0" cy="16" r="2.6" fill="#96623a" />
            <g transform="translate(0,16)">
              <g transform="rotate(57.4)">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="57.4;60.6;62.5;63;62;59.7;56.1;51.5;46.2;40.6;35.1;30;25.7;22.5;20.6;20.1;21;23.4;27;31.6;36.9;42.5;48;53.1;57.4"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="16"
                  stroke="#96623a"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="16" r="3.2" fill="#2d1e19" />
              </g>
            </g>
          </g>
        </g>
      </g>
      <g transform="translate(395,204.7)">
        <animateTransform
          attributeName="transform"
          type="translate"
          values="395 204.7;395 205;395 204.9;395 204.6;395 203.9;395 203;395 201.8;395 200.5;395 199.2;395 198;395 196.9;395 196;395 195.3;395 195;395 195.1;395 195.4;395 196.1;395 197;395 198.2;395 199.5;395 200.8;395 202;395 203.1;395 204;395 204.7"
          dur="1.2s"
          repeatCount="indefinite"
        />
        <g transform="translate(22,12)">
          <g transform="rotate(29)">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="29;19.8;9.3;-1.9;-12.9;-23.1;-31.7;-38.1;-42;-42.9;-41;-36.2;-29;-19.8;-9.3;1.9;12.9;23.1;31.7;38.1;42;42.9;41;36.2;29"
              dur="1.2s"
              repeatCount="indefinite"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="16"
              stroke="#704628"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="0" cy="16" r="2.6" fill="#704628" />
            <g transform="translate(0,16)">
              <g transform="rotate(20.4)">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="20.4;20.1;21.4;24;27.8;32.5;37.9;43.5;49;53.9;58.1;61;62.7;62.9;61.7;59.1;55.3;50.5;45.2;39.6;34.1;29.1;25;22;20.4"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="16"
                  stroke="#704628"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="16" r="3.2" fill="#2d1e19" />
              </g>
            </g>
          </g>
        </g>
        <g transform="translate(-24,12)">
          <g transform="rotate(42.1)">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="42.1;38.5;32.2;23.7;13.6;2.6;-8.6;-19.2;-28.5;-35.8;-40.8;-42.9;-42.1;-38.5;-32.2;-23.7;-13.6;-2.6;8.6;19.2;28.5;35.8;40.8;42.9;42.1"
              dur="1.2s"
              repeatCount="indefinite"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="16"
              stroke="#704628"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="0" cy="16" r="2.6" fill="#704628" />
            <g transform="translate(0,16)">
              <g transform="rotate(26.6)">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="26.6;23.1;20.9;20.1;20.7;22.8;26.1;30.5;35.7;41.2;46.8;52;56.5;60;62.2;63;62.4;60.3;56.9;52.5;47.4;41.8;36.3;31.1;26.6"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="16"
                  stroke="#704628"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="16" r="3.2" fill="#2d1e19" />
              </g>
            </g>
          </g>
        </g>
        <ellipse cx="-36" cy="-6" rx="6" ry="5" fill="#faf8f5" />
        <ellipse cx="0" cy="0" rx="38" ry="19" fill="#96623a" />
        <ellipse cx="2" cy="9" rx="28" ry="9" fill="#debe96" />
        <polyline
          points="20,-18 20,18"
          fill="none"
          stroke="#c8232d"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="-8" r="2.2" fill="#ffd246" />
        <circle cx="20" cy="0" r="2.2" fill="#ffd246" />
        <circle cx="20" cy="8" r="2.2" fill="#ffd246" />
        <polygon points="22,-14 36,-40 48,-34 36,4" fill="#96623a" />
        <ellipse cx="46" cy="-40" rx="13" ry="10" fill="#96623a" />
        <ellipse cx="58" cy="-36" rx="8" ry="6" fill="#debe96" />
        <circle cx="63" cy="-37" r="3.4" fill="#321e1e" />
        <circle cx="49" cy="-43" r="2.2" fill="#140f0f" />
        <circle cx="49.7" cy="-43.6" r="0.8" fill="#ffffff" />
        <ellipse cx="38" cy="-46" rx="3.5" ry="7" fill="#784c2c" />
        <polyline
          points="42,-48 38,-64 41,-74"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="39,-60 30,-68"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="40,-68 48,-74"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="47,-48 44.5,-64 46,-74"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="44,-60 35,-68"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="45,-68 53,-74"
          fill="none"
          stroke="#d6be8c"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g transform="translate(24,12)">
          <g transform="rotate(-29)">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="-29;-19.8;-9.3;1.9;12.9;23.1;31.7;38.1;42;42.9;41;36.2;29;19.8;9.3;-1.9;-12.9;-23.1;-31.7;-38.1;-42;-42.9;-41;-36.2;-29"
              dur="1.2s"
              repeatCount="indefinite"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="16"
              stroke="#96623a"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="0" cy="16" r="2.6" fill="#96623a" />
            <g transform="translate(0,16)">
              <g transform="rotate(62.7)">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="62.7;62.9;61.7;59.1;55.3;50.5;45.2;39.6;34.1;29.1;25;22;20.4;20.1;21.4;24;27.8;32.5;37.9;43.5;49;53.9;58.1;61;62.7"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="16"
                  stroke="#96623a"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="16" r="3.2" fill="#2d1e19" />
              </g>
            </g>
          </g>
        </g>
        <g transform="translate(-22,12)">
          <g transform="rotate(-4.9)">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="-4.9;6.4;17.1;26.8;34.5;40;42.7;42.5;39.4;33.6;25.6;15.7;4.9;-6.4;-17.1;-26.8;-34.5;-40;-42.7;-42.5;-39.4;-33.6;-25.6;-15.7;-4.9"
              dur="1.2s"
              repeatCount="indefinite"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="16"
              stroke="#96623a"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="0" cy="16" r="2.6" fill="#96623a" />
            <g transform="translate(0,16)">
              <g transform="rotate(60.8)">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="60.8;57.7;53.5;48.5;43;37.4;32;27.4;23.7;21.2;20.1;20.5;22.3;25.4;29.6;34.6;40.1;45.7;51;55.7;59.4;61.9;63;62.6;60.8"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="16"
                  stroke="#96623a"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="16" r="3.2" fill="#2d1e19" />
              </g>
            </g>
          </g>
        </g>
      </g>
      <path
        d="M320 206 L361 203.7 L415 203.7 L456 201.8 L510 201.8 L551 199 L605 199"
        fill="none"
        stroke="#3c2412"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <animate attributeName="d" values={REINS_D} dur="1.2s" repeatCount="indefinite" />
      </path>
      <path
        d="M320 206 L361 203.7 L415 203.7 L456 201.8 L510 201.8 L551 199 L605 199"
        fill="none"
        stroke="#ffd664"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <animate attributeName="d" values={REINS_D} dur="1.2s" repeatCount="indefinite" />
      </path>
      <g transform="translate(415,203.7)">
        <animateTransform
          attributeName="transform"
          type="translate"
          values="415 203.7;415 204;415 203.9;415 203.6;415 202.9;415 202;415 200.8;415 199.5;415 198.2;415 197;415 195.9;415 195;415 194.3;415 194;415 194.1;415 194.4;415 195.1;415 196;415 197.2;415 198.5;415 199.8;415 201;415 202.1;415 203;415 203.7"
          dur="1.2s"
          repeatCount="indefinite"
        />
        <circle r="3" fill="#ffd664" />
        <circle r="1.4" fill="#3c2412" />
      </g>
      <g transform="translate(510,201.8)">
        <animateTransform
          attributeName="transform"
          type="translate"
          values="510 201.8;510 202.8;510 203.5;510 203.9;510 204;510 203.7;510 203.1;510 202.3;510 201.2;510 199.9;510 198.6;510 197.3;510 196.2;510 195.2;510 194.5;510 194.1;510 194;510 194.3;510 194.9;510 195.7;510 196.8;510 198.1;510 199.4;510 200.7;510 201.8"
          dur="1.2s"
          repeatCount="indefinite"
        />
        <circle r="3" fill="#ffd664" />
        <circle r="1.4" fill="#3c2412" />
      </g>
      <g transform="translate(605,199)">
        <animateTransform
          attributeName="transform"
          type="translate"
          values="605 199;605 200.3;605 201.5;605 202.5;605 203.3;605 203.8;605 204;605 203.8;605 203.3;605 202.5;605 201.5;605 200.3;605 199;605 197.7;605 196.5;605 195.5;605 194.7;605 194.2;605 194;605 194.2;605 194.7;605 195.5;605 196.5;605 197.7;605 199"
          dur="1.2s"
          repeatCount="indefinite"
        />
        <circle r="3" fill="#ffd664" />
        <circle r="1.4" fill="#3c2412" />
      </g>
    </>
  );
}
