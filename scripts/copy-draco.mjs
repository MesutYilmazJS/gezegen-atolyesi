// three'nin Draco çözücüsünü public/draco altına kopyalar (GLB modelleri için).
import { cpSync, existsSync, mkdirSync } from 'node:fs';

const src = 'node_modules/three/examples/jsm/libs/draco/gltf';
const dest = 'public/draco';
if (existsSync(src)) {
  mkdirSync(dest, { recursive: true });
  // Kodlayıcı (encoder) tarayıcıda gerekmez
  cpSync(src, dest, { recursive: true, filter: (f) => !f.endsWith('draco_encoder.js') });
  console.log('Draco çözücüsü kopyalandı →', dest);
}
