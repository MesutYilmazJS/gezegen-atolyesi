// Gezegen yüzeyi, bulutlar, atmosfer halesi ve halkalar için shader'lar.

/** Yüzey, bulut ve halka shader'larının ortak parçaları */
export const commonGLSL = /* glsl */ `
const float PI = 3.14159265359;

vec2 dirToUv(vec3 d) {
  return vec2(atan(d.z, d.x) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
}

// Bulut yoğunluğu: enleme göre farklı hızlarda kayan iki katman
float cloudDensity(sampler2D tex, vec3 d, float time, float cover) {
  vec2 uv = dirToUv(d);
  float lat = d.y;
  float drift = time * (0.004 + 0.003 * sin(lat * 6.0));
  float a = texture2D(tex, vec2(fract(uv.x + drift), uv.y)).r;
  float b = texture2D(tex, vec2(fract(uv.x - drift * 0.6 + 0.37), uv.y)).g;
  float n = a * 0.75 + b * 0.25;
  float threshold = 1.0 - cover;
  return smoothstep(threshold - 0.08, threshold + 0.22, n) * step(0.001, cover);
}

float hash11(float n) { return fract(sin(n) * 43758.5453); }

float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), u);
}

// Halka yoğunluğu: r halkanın içinden dışına 0..1
float ringDensity(float r, float seed) {
  if (r < 0.0 || r > 1.0) return 0.0;
  float bands = noise1(r * 60.0 + seed) * 0.55 + noise1(r * 170.0 + seed * 2.0) * 0.3 + noise1(r * 13.0 + seed * 3.0) * 0.45;
  float gap1 = 1.0 - (1.0 - smoothstep(0.0, 0.025, abs(r - (0.55 + 0.2 * hash11(seed))))) * 0.9;
  float gap2 = 1.0 - (1.0 - smoothstep(0.0, 0.012, abs(r - (0.25 + 0.15 * hash11(seed + 1.0))))) * 0.7;
  float edge = smoothstep(0.0, 0.04, r) * (1.0 - smoothstep(0.93, 1.0, r));
  return clamp(bands, 0.0, 1.0) * gap1 * gap2 * edge;
}

vec3 toneLinear(vec3 c) { return pow(c, vec3(2.2)); }
`;

export const planetVertex = /* glsl */ `
varying vec3 vObjDir;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vObjDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const planetFragment = /* glsl */ `
precision highp float;
varying vec3 vObjDir;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uSeaLevel;
uniform float uHeightMin;
uniform float uHeightMax;
uniform float uWater;
uniform float uOceanFill;
uniform float uSeaIce;
uniform float uIceLine;
uniform float uHeat;
uniform float uMolten;
uniform float uCraters;
uniform float uMicrobes;
uniform float uVegetation;
uniform vec3 uVegColor;
uniform float uCities;
uniform float uLava;
uniform vec3 uSkyColor;
uniform float uHaze;
uniform float uCloudCover;
uniform float uPlanetRadius;
uniform float uBump;
// Halka gölgesi
uniform float uRingEnabled;
uniform vec3 uRingNormal;
uniform float uRingInner;
uniform float uRingOuter;
uniform float uRingSeed;
uniform float uRingOpacity;

COMMON_GLSL

vec3 perturbNormal(vec3 pos, vec3 n, float h) {
  vec3 dpx = dFdx(pos);
  vec3 dpy = dFdy(pos);
  float dhx = dFdx(h);
  float dhy = dFdy(h);
  vec3 r1 = cross(dpy, n);
  vec3 r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * n - grad);
}

void main() {
  vec3 dir = normalize(vObjDir);
  vec2 uv = dirToUv(dir);
  vec4 A = texture2D(uTexA, uv);
  vec4 B = texture2D(uTexB, uv);

  float h = (A.r - 0.5) * 4.0;
  float moisture = A.g;
  float crater = (A.b - 0.5) * 2.0;
  float detail = A.a;
  float lat = abs(dir.y);

  h += crater * uCraters * 0.22;

  // Okyanuslar zamanla en alçak yerlerden dolarak yükselir
  float waterLevel = mix(uHeightMin - 0.01, uSeaLevel, uOceanFill);
  float depth = waterLevel - h;
  float isOcean = smoothstep(-0.004, 0.004, depth) * step(0.001, uOceanFill);
  float landH = clamp((h - uSeaLevel) / max(uHeightMax - uSeaLevel, 0.01), 0.0, 1.0);

  // --- Kara rengi ---
  float dry = 1.0 - uWater;
  vec3 rockDark = mix(toneLinear(vec3(0.33, 0.30, 0.27)), toneLinear(vec3(0.42, 0.2, 0.1)), dry * dry);
  vec3 rockLight = mix(toneLinear(vec3(0.58, 0.52, 0.44)), toneLinear(vec3(0.72, 0.42, 0.22)), dry);
  vec3 sand = toneLinear(vec3(0.82, 0.68, 0.46));
  vec3 land = mix(rockDark, rockLight, smoothstep(0.2, 0.9, detail));
  // Çöl kuşakları (subtropikal) ve kuru bölgeler
  float wetness = moisture + uWater * 0.35 - smoothstep(0.15, 0.45, lat) * (1.0 - smoothstep(0.45, 0.7, lat)) * 0.25 + smoothstep(0.0, 0.08, max(0.0, -depth + 0.08)) * 0.0;
  float desert = smoothstep(0.62, 0.38, wetness) * (1.0 - landH * 0.8);
  land = mix(land, sand, desert * 0.7 * step(0.05, uWater + 0.06));
  // Kurumuş havzalar (okyanus yoksa)
  float basin = smoothstep(0.0, 0.08, uSeaLevel - h) * (1.0 - isOcean);
  land = mix(land, toneLinear(vec3(0.78, 0.74, 0.66)), basin * 0.45 * step(0.02, uWater));
  // Krater çanakları biraz koyu
  land *= 1.0 - max(0.0, -crater) * uCraters * 0.35;

  // Bitki örtüsü
  float vegMask = smoothstep(0.42, 0.62, wetness) * (1.0 - smoothstep(0.55, 0.85, landH)) * uVegetation;
  vegMask *= 1.0 - smoothstep(uIceLine - 0.25, uIceLine - 0.05, lat);
  vec3 vegColor = uVegColor * (0.7 + 0.6 * detail);
  land = mix(land, vegColor, clamp(vegMask, 0.0, 1.0));

  // Isı: kavrulmuş yüzey
  land = mix(land, land * vec3(0.55, 0.42, 0.36), uHeat * 0.7);

  // --- Okyanus rengi ---
  vec3 shallow = toneLinear(vec3(0.12, 0.45, 0.55));
  vec3 deep = toneLinear(vec3(0.02, 0.07, 0.2));
  vec3 ocean = mix(shallow, deep, smoothstep(0.0, 0.35, depth));
  ocean = mix(ocean, toneLinear(vec3(0.08, 0.32, 0.28)), uMicrobes * 0.35 * (1.0 - smoothstep(0.0, 0.15, depth)));
  ocean = mix(ocean, ocean * vec3(0.8, 0.75, 0.6), uHeat);

  vec3 albedo = mix(land, ocean, isOcean);

  // --- Buz ---
  float iceWobble = (detail - 0.5) * 0.12 + (moisture - 0.5) * 0.08;
  float polarIce = smoothstep(uIceLine - 0.03, uIceLine + 0.03, lat + iceWobble);
  float mountainSnow = smoothstep(0.72, 0.9, landH + (1.0 - uIceLine) * 0.6) * (1.0 - isOcean) * step(0.02, uWater);
  float seaIce = isOcean * max(uSeaIce * smoothstep(0.3, 0.6, detail + uSeaIce * 0.6), polarIce);
  float ice = clamp(max(max(polarIce * step(0.02, uWater), mountainSnow), seaIce), 0.0, 1.0) * (1.0 - uMolten);
  vec3 iceColor = toneLinear(vec3(0.9, 0.94, 0.98)) * (0.85 + 0.15 * detail);
  albedo = mix(albedo, iceColor, ice);

  // --- Erimiş dünya (doğuş) ---
  // Kabuk plakaları arasında ince, parlayan lav çatlakları; zamanla kabuk kalınlaşır
  float crustN = detail + (moisture - 0.5) * 0.35 + h * 0.08;
  float crack = 1.0 - smoothstep(0.0, 0.035 + 0.05 * uMolten, abs(crustN - 0.5));
  float pools = smoothstep(0.1, -0.25, h) * uMolten;
  float crust = 1.0 - max(crack, pools);
  vec3 moltenCol = mix(toneLinear(vec3(1.0, 0.42, 0.08)) * 2.2, toneLinear(vec3(0.12, 0.08, 0.07)), crust);
  albedo = mix(albedo, toneLinear(vec3(0.1, 0.08, 0.07)), uMolten);
  vec3 emissive = mix(vec3(0.0), moltenCol * (1.0 - crust), uMolten);

  // Volkanik lav damarları
  float lavaMask = smoothstep(0.78, 0.9, detail) * smoothstep(0.1, 0.6, landH + 0.2) * (1.0 - isOcean) * uLava * (1.0 - ice);
  emissive += toneLinear(vec3(1.0, 0.38, 0.08)) * lavaMask * 1.6;
  // Çok sıcak yüzey kızıl parlar
  emissive += toneLinear(vec3(0.7, 0.18, 0.05)) * smoothstep(0.75, 1.0, uHeat) * (0.3 + 0.7 * detail) * 0.6;

  // --- Aydınlatma ---
  vec3 N = normalize(vWorldNormal);
  float bumpAmount = uBump * (1.0 - isOcean) * (1.0 - ice * 0.6);
  vec3 Nb = perturbNormal(vWorldPos, N, h * bumpAmount * uPlanetRadius);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float NdotL = dot(Nb, L);
  float NdotLs = dot(N, L);
  // Atmosfer alacakaranlığı yumuşatır
  float wrap = 0.15 * uHaze;
  float diffuse = clamp((NdotL + wrap) / (1.0 + wrap), 0.0, 1.0);

  // Bulut gölgesi
  float cloudShadow = cloudDensity(uTexB, normalize(dir + vec3(0.0, 0.0, 0.0)), uTime, uCloudCover) * 0.45;

  // Halka gölgesi
  float ringShadow = 0.0;
  if (uRingEnabled > 0.5) {
    float denom = dot(L, uRingNormal);
    if (abs(denom) > 0.0001) {
      float tHit = -dot(vWorldPos, uRingNormal) / denom;
      if (tHit > 0.0) {
        vec3 q = vWorldPos + L * tHit;
        float r = (length(q) - uRingInner) / (uRingOuter - uRingInner);
        ringShadow = ringDensity(r, uRingSeed) * uRingOpacity * 0.85;
      }
    }
  }

  vec3 light = uSunColor * diffuse * (1.0 - cloudShadow) * (1.0 - ringShadow);
  vec3 ambient = uSkyColor * 0.02 * uHaze + vec3(0.006);
  vec3 col = albedo * (light + ambient);

  // Okyanus parlaması
  vec3 Hh = normalize(L + V);
  float spec = pow(max(dot(N, Hh), 0.0), 90.0) * isOcean * (1.0 - ice) * step(0.0, NdotLs);
  col += uSunColor * spec * 0.6 * (1.0 - cloudShadow);

  // Gece tarafı: şehir ışıkları
  float night = smoothstep(0.08, -0.18, NdotLs);
  float cityMask = smoothstep(0.62, 0.78, B.b) * (1.0 - isOcean) * (1.0 - ice) * (1.0 - smoothstep(0.35, 0.7, landH));
  cityMask *= smoothstep(0.0, 0.15, h - uSeaLevel + 0.15) * 0.6 + 0.4 * smoothstep(0.66, 0.74, B.b);
  emissive += toneLinear(vec3(1.0, 0.78, 0.45)) * cityMask * uCities * night * 1.4;

  col += emissive;

  // Atmosfer kenar saçılması (gündüz tarafı)
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.5);
  float dayside = smoothstep(-0.25, 0.4, NdotLs);
  col = mix(col, uSkyColor * uSunColor * 0.8, rim * uHaze * dayside * 0.5);
  // Hafif genel pus
  col += uSkyColor * uSunColor * uHaze * 0.035 * dayside;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const cloudVertex = planetVertex;

export const cloudFragment = /* glsl */ `
precision highp float;
varying vec3 vObjDir;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
uniform sampler2D uTexB;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCloudColor;
uniform vec3 uSkyColor;
uniform float uTime;
uniform float uCover;
uniform float uOpacity;

COMMON_GLSL

void main() {
  vec3 dir = normalize(vObjDir);
  float d = cloudDensity(uTexB, dir, uTime, uCover);
  vec2 uv = dirToUv(dir);
  float storm = texture2D(uTexB, uv).a;
  d *= 0.8 + 0.3 * storm;
  if (d < 0.01) discard;
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uSunDir);
  float NdotL = dot(N, L);
  float lit = clamp((NdotL + 0.2) / 1.2, 0.0, 1.0);
  // Alacakaranlıkta bulutlar kızarır
  vec3 sunset = mix(vec3(1.0, 0.45, 0.2), vec3(1.0), smoothstep(0.0, 0.35, NdotL));
  vec3 col = toneLinear(uCloudColor) * uSunColor * sunset * lit + uSkyColor * 0.02;
  gl_FragColor = vec4(col, clamp(d, 0.0, 1.0) * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const atmosphereVertex = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const atmosphereFragment = /* glsl */ `
precision highp float;
varying vec3 vWorldPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform float uHaze;
uniform float uPlanetRadius;
uniform float uAtmoRadius;

void main() {
  vec3 D = normalize(vWorldPos - cameraPosition);
  vec3 toCenter = -cameraPosition;
  float tc = dot(toCenter, D);
  vec3 closest = cameraPosition + D * tc;
  float p = length(closest);
  float x = clamp((uAtmoRadius - p) / (uAtmoRadius - uPlanetRadius), 0.0, 1.0);
  float glow = pow(x, 2.2);
  vec3 L = normalize(uSunDir);
  float sunSide = dot(normalize(closest), L);
  float day = smoothstep(-0.35, 0.3, sunSide);
  vec3 dusk = mix(vec3(1.0, 0.4, 0.15), vec3(1.0), smoothstep(-0.1, 0.35, sunSide));
  vec3 col = uSkyColor * uSunColor * dusk * glow * day * 1.6;
  gl_FragColor = vec4(col * uHaze, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const ringVertex = /* glsl */ `
varying vec3 vLocal;
varying vec3 vWorldPos;
void main() {
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const ringFragment = /* glsl */ `
precision highp float;
varying vec3 vLocal;
varying vec3 vWorldPos;
uniform vec3 uColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uRingNormal;
uniform float uInner;
uniform float uOuter;
uniform float uSeed;
uniform float uOpacity;
uniform float uPlanetRadius;
uniform float uScatter;

COMMON_GLSL

void main() {
  float r = (length(vLocal.xy) - uInner) / (uOuter - uInner);
  float dens = ringDensity(r, uSeed);
  if (dens < 0.01) discard;
  vec3 L = normalize(uSunDir);
  // Gezegenin gölgesi
  float t = dot(-vWorldPos, L);
  float shadow = 0.0;
  if (t > 0.0) {
    float dist = length(vWorldPos + L * t);
    shadow = 1.0 - smoothstep(uPlanetRadius * 0.97, uPlanetRadius * 1.03, dist);
  }
  float facing = abs(dot(uRingNormal, L));
  vec3 V = normalize(cameraPosition - vWorldPos);
  // Toz halkalar arkadan aydınlanınca parlar (ileri saçılma)
  float forward = pow(max(dot(-V, L), 0.0), 6.0) * uScatter;
  float shade = 0.25 + 0.75 * facing + forward * 2.0;
  float band = 0.75 + 0.5 * noise1(r * 300.0 + uSeed);
  vec3 col = toneLinear(uColor) * band * uSunColor * shade * (1.0 - shadow * 0.92);
  gl_FragColor = vec4(col, dens * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function withCommon(src: string): string {
  return src.replace('COMMON_GLSL', commonGLSL);
}
