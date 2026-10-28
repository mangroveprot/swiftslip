/**
 * The API's `dev` script runs `ts-node-dev --respawn`, a watcher that restarts
 * the server forever. That is exactly what you want on a laptop and exactly
 * what you do NOT want in a CI/build environment: if a host such as Vercel is
 * mistakenly configured to run `npm run dev` as its build command, the watcher
 * crash-loops and the deployment hangs indefinitely (the log fills with
 * "Using TypeScript … (local user-provided)" once per restart).
 *
 * Fail fast with an actionable message instead of hanging.
 */
// Vercel (and most other build hosts) set `CI=1` for build steps. `vercel dev`
// does not, so this still allows local emulation.
const isCi = process.env.CI === '1' || process.env.CI === 'true';

if (isCi) {
  console.error(
    [
      '',
      '[swiftslip/api] Refusing to start the dev watcher in CI/Vercel.',
      'This script is for local development only; it never exits.',
      "Set the host's build command to the web build instead:",
      '  npm run build -w @swiftslip/web',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
