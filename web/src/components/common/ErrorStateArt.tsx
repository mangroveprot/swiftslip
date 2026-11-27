/**
 * The one illustration every error surface shows: a glum little machine with a
 * single tear. It replaces the per-status lucide glyphs (wifi-off, lock,
 * search-x, …) so an offline blip, a signed-out session and a missing page all
 * read as the same calm "this didn't load" rather than a wall of different
 * warning symbols.
 *
 * The mark is drawn in `currentColor`, so the caller only sets the text colour
 * (the shared block uses `text-muted-foreground`). No tile, border or box sits
 * behind it — the artwork is the whole icon.
 */
export function ErrorStateArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 340 330"
      fill="none"
      stroke="currentColor"
      strokeWidth={7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M127 80 V33 Q127 14 150 13 H230 Q252 14 252 33 V84" />
      <path d="M153 78 V42 Q153 32 164 32 H218 Q229 32 229 42 V82" />
      <path d="M182 33 V53 M198 33 V53 M176 53 H204 V79 H176 Z M181 79 V89 H199 V79" />
      <circle cx="190" cy="66" r="7" />
      <path d="M127 80 C106 88 97 104 96 130 V137 M96 163 C98 195 105 215 105 232 V279 C105 291 113 297 125 300 M252 84 C276 92 285 110 286 137 L283 165 M276 216 L272 279 C271 291 264 297 252 300" />
      <path d="M125 300 V309 Q126 317 140 318 Q190 325 238 318 Q251 316 252 308 V300 M125 300 Q188 313 252 300" />
      <path d="M127 80 Q190 98 252 84 M106 265 Q190 283 272 265 M107 274 Q190 292 271 274" />
      <path d="M96 137 C80 142 70 165 70 195 C70 212 88 214 90 198 C91 188 93 175 96 163" />
      <path d="M283 165 C285 176 286 188 286 198 C287 214 305 212 306 196 C308 168 300 145 286 137" />
      <ellipse cx="185" cy="163" rx="23" ry="27" />
      <ellipse cx="235" cy="166" rx="21" ry="26" />
      <circle cx="190" cy="173" r="11" />
      <circle cx="232" cy="175" r="11" />
      <g fill="currentColor" stroke="none">
        <circle cx="191" cy="175" r="5" />
        <circle cx="231" cy="177" r="5" />
      </g>
      <path d="M164 134 Q180 129 198 117 M228 117 Q243 128 255 133" />
      <path d="M190 217 Q198 209 206 217 T222 217 T236 213" />
      <path d="M304 62C312 74 315 80 315 85a11 11 0 01-22 0c0-5 3-11 11-23z" />
    </svg>
  );
}
