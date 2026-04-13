'use strict';
/**
 * Ensures dist/main.js exists before `npm start` runs node.
 * If missing (clean checkout, failed prior build, etc.), runs `npm run build` once.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const mainJs = path.join(root, 'dist', 'main.js');
/** If main exists but a known emitted module is missing, dist is stale/partial — rebuild. */
const authChangePasswordDto = path.join(root, 'dist', 'auth', 'dto', 'change-password.dto.js');

if (fs.existsSync(mainJs) && fs.existsSync(authChangePasswordDto)) {
  process.exit(0);
}

if (!fs.existsSync(mainJs)) {
  console.warn('[backend] dist/main.js not found — running npm run build...');
} else if (!fs.existsSync(authChangePasswordDto)) {
  console.warn(
    '[backend] dist/main.js exists but dist/auth/dto/change-password.dto.js is missing (stale/partial build) — running npm run build...',
  );
}
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const r = spawnSync(npmCmd, ['run', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});
process.exit(typeof r.status === 'number' ? r.status : 1);
