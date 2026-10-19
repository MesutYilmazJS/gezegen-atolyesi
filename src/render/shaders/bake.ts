// Gezegen yüzeyini bir kez dokuya "pişiren" shader.
// Ağır gürültü hesapları yalnızca tohum değişince yapılır; her karede sadece doku okunur.
// Doku A: r = yükseklik, g = nem, b = krater, a = ince ayrıntı
// Doku B: r = bulut, g = ince bulut, b = şehir dokusu, a = fırtına
// uPass = 2: düşük çözünürlüklü yükseklik ölçümü (deniz seviyesini hesaplamak için)
import { noiseGLSL } from './noise';

export const bakeVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const bakeFragment = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uSeedOffset;
uniform int uPass;
uniform int uOctaves;
uniform float uTectonics;

${noiseGLSL}

const float PI = 3.14159265359;

vec3 dirFromUv(vec2 uv) {
  float lon = (uv.x - 0.5) * 2.0 * PI;
  float lat = (uv.y - 0.5) * PI;
  return vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
}

float heightAt(vec3 d) {
  vec3 p = d + uSeedOffset;
  vec3 warp = vec3(fbm(p * 1.3, 4), fbm(p * 1.3 + 7.1, 4), fbm(p * 1.3 + 13.7, 4));
  // Tektonik hareket: daha parçalı kıtalar ve daha yüksek dağlar
  float continents = fbm(p * (0.9 + 0.7 * uTectonics) + warp * 0.55, uOctaves);
  float mountains = ridged(p * 2.6 + warp * 0.3, uOctaves);
  float h = continents * 1.15;
  h += (mountains - 0.35) * (0.15 + 0.85 * uTectonics) * smoothstep(-0.05, 0.35, continents);
  h += fbm(p * 9.0, 3) * 0.05;
  return h;
}

// 16 bit'i iki 8 bit kanala paketle (ölçüm geçişi için)
vec2 pack16(float v) {
  v = clamp(v, 0.0, 0.99998);
  float hi = floor(v * 255.0) / 255.0;
  float lo = fract(v * 255.0);
  return vec2(hi, lo);
}

void main() {
  vec3 d = dirFromUv(vUv);
  vec3 p = d + uSeedOffset;

  if (uPass == 0) {
    float h = heightAt(d);
    float moisture = fbm(p * 2.2 + 31.0, 5) * 0.5 + 0.5;
    float craters = craterField(p * 5.0, 0.55) + craterField(p * 13.0, 0.45) * 0.5 + craterField(p * 2.2, 0.3) * 1.3;
    float detail = fbm(p * 14.0 + 3.0, 4) * 0.5 + 0.5;
    gl_FragColor = vec4(h * 0.25 + 0.5, moisture, craters * 0.5 + 0.5, detail);
  } else if (uPass == 1) {
    // Bulutlar: enleme göre kuşaklar + bükülmüş gürültü
    vec3 q = p * 2.4 + vec3(fbm(p * 2.0 + 50.0, 4), fbm(p * 2.0 + 60.0, 4), fbm(p * 2.0 + 70.0, 4)) * 1.2;
    float bands = sin(d.y * 9.0 + fbm(p * 3.0, 3) * 2.0) * 0.12;
    float cloud = fbm(q, 6) * 0.5 + 0.5 + bands;
    float fine = fbm(p * 11.0 + 90.0, 4) * 0.5 + 0.5;
    float city = fbm(p * 38.0 + 120.0, 3) * 0.5 + 0.5;
    float storm = fbm(p * 1.6 + 200.0, 3) * 0.5 + 0.5;
    gl_FragColor = vec4(cloud, fine, city, storm);
  } else {
    float h = heightAt(d) * 0.25 + 0.5;
    gl_FragColor = vec4(pack16(h), 0.0, 1.0);
  }
}
`;
