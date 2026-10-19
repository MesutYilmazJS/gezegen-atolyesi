// Blender betiklerini arka planda çalıştırır: npm run blender
// BLENDER ortam değişkeniyle Blender yolu değiştirilebilir.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const candidates = [
  process.env.BLENDER,
  '/Applications/Blender.app/Contents/MacOS/Blender',
  'blender',
].filter(Boolean);
const blender = candidates.find((p) => p === 'blender' || existsSync(p));

for (const script of ['blender/moons.py', 'blender/asteroid.py', 'blender/probe.py', 'blender/landscapes.py', 'blender/icon.py', 'blender/badges.py']) {
  console.log(`▶ ${script}`);
  execFileSync(blender, ['--background', '--factory-startup', '--python', script], { stdio: 'inherit' });
}
