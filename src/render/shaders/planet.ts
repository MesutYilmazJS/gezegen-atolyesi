// Gezegen yüzeyi, bulutlar, atmosfer halesi ve halkalar için shader'lar.

export const MAX_IMPACTS = 4;

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
uniform vec3 uSun2Dir;
uniform vec3 uSun2Color;
uniform float uTime;
uniform float uCloudTime;
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
uniform float uSmog;
uniform float uLava;
uniform float uAurora;
uniform float uTidalLock;
uniform float uIceCracks;
uniform vec3 uSkyColor;
uniform float uHaze;
uniform float uCloudCover;
uniform float uPlanetRadius;
uniform float uBump;
uniform vec3 uRockDark;
uniform vec3 uRockLight;
uniform vec3 uSand;
uniform vec3 uShallow;
uniform vec3 uDeep;
// Gaz devi
uniform float uGas;
uniform vec3 uGasC1;
uniform vec3 uGasC2;
uniform vec3 uGasC3;
// Çarpma kraterleri
uniform int uImpactCount;
uniform vec3 uImpactDir[${MAX_IMPACTS}];
uniform float uImpactAge[${MAX_IMPACTS}];
uniform float uImpactSize[${MAX_IMPACTS}];
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

float ringShadowAt(vec3 p, vec3 L) {
  if (uRingEnabled < 0.5) return 0.0;
  float denom = dot(L, uRingNormal);
  if (abs(denom) < 0.0001) return 0.0;
  float tHit = -dot(p, uRingNormal) / denom;
  if (tHit <= 0.0) return 0.0;
  vec3 q = p + L * tHit;
  float r = (length(q) - uRingInner) / (uRingOuter - uRingInner);
  return ringDensity(r, uRingSeed) * uRingOpacity * 0.85;
}

vec3 gasGiant(vec3 dir, vec2 uv, vec4 A) {
  float lat = dir.y;
  // Bantlar: enleme göre zıt yönlere akan, gürültüyle bükülmüş şeritler
  float flow = uTime * 0.01 * (mod(floor(lat * 9.0), 2.0) * 2.0 - 1.0);
  vec4 Bf = texture2D(uTexB, vec2(fract(uv.x + flow), uv.y));
  float warp = (Bf.r - 0.5) * 0.9 + (A.a - 0.5) * 0.35;
  float band = sin(lat * 22.0 + warp * 3.0);
  float band2 = sin(lat * 57.0 + warp * 5.0 + 1.3);
  vec3 col = mix(uGasC1, uGasC2, smoothstep(-0.3, 0.6, band));
  col = mix(col, uGasC3, smoothstep(0.4, 0.95, band2) * 0.6);
  col *= 0.85 + 0.3 * Bf.g;
  // Büyük leke
  vec3 spotC = normalize(vec3(cos(1.2), -0.38, sin(1.2)));
  vec3 t1 = normalize(cross(spotC, vec3(0.0, 1.0, 0.0)));
  vec3 t2 = cross(spotC, t1);
  vec2 q = vec2(dot(dir, t1) / 0.16, dot(dir, t2) / 0.09);
  float sd = length(q);
  if (dot(dir, spotC) > 0.0 && sd < 1.3) {
    float ang = atan(q.y, q.x);
    float swirl = 0.5 + 0.5 * sin(ang * 3.0 + sd * 9.0 - uTime * 0.6);
    vec3 spot = mix(uGasC2 * vec3(1.25, 0.75, 0.6), uGasC1, swirl * 0.4);
    col = mix(col, spot, (1.0 - smoothstep(0.7, 1.3, sd)) * 0.85);
  }
  return toneLinear(col);
}

void main() {
  vec3 dir = normalize(vObjDir);
  vec2 uv = dirToUv(dir);
  vec4 A = texture2D(uTexA, uv);
  vec4 B = texture2D(uTexB, uv);

  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uSunDir);
  vec3 L2 = normalize(uSun2Dir);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float NdotLs = dot(N, L);
  float NdotL2s = dot(N, L2);

  if (uGas > 0.5) {
    vec3 albedo = gasGiant(dir, uv, A);
    float d1 = clamp((NdotLs + 0.08) / 1.08, 0.0, 1.0) * (1.0 - ringShadowAt(vWorldPos, L));
    float d2 = clamp((NdotL2s + 0.08) / 1.08, 0.0, 1.0);
    vec3 col = albedo * (uSunColor * d1 + uSun2Color * d2 + vec3(0.004));
    float rimG = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col = mix(col, albedo * uSunColor * 0.6, rimG * smoothstep(-0.2, 0.4, NdotLs) * 0.4);
    // Gece tarafında şimşekler
    float flash = step(0.996, hash11(floor(uTime * 3.0) + floor(B.b * 40.0))) * smoothstep(0.1, -0.2, NdotLs);
    col += vec3(0.6, 0.65, 1.0) * flash * smoothstep(0.6, 0.8, B.r) * 0.4;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }

  float h = (A.r - 0.5) * 4.0;
  float moisture = A.g;
  float crater = (A.b - 0.5) * 2.0;
  float detail = A.a;
  float lat = abs(dir.y);

  h += crater * uCraters * 0.22;

  // Çarpma kraterleri
  float impactBowl = 0.0;
  vec3 impactGlow = vec3(0.0);
  float ejecta = 0.0;
  for (int i = 0; i < ${MAX_IMPACTS}; i++) {
    if (i >= uImpactCount) break;
    float d = acos(clamp(dot(dir, uImpactDir[i]), -1.0, 1.0));
    float r = uImpactSize[i];
    float x = d / r;
    if (x < 3.0) {
      float bowl = x < 1.0 ? -(1.0 - x * x) : 0.0;
      float rimI = smoothstep(0.75, 1.0, x) * (1.0 - smoothstep(1.0, 1.4, x));
      h += (bowl * 0.35 + rimI * 0.18) * r * 4.0;
      impactBowl = max(impactBowl, -bowl);
      float fresh = 1.0 - smoothstep(0.0, 0.03, uImpactAge[i]);
      impactGlow += vec3(1.0, 0.35, 0.06) * fresh * (1.0 - smoothstep(0.2, 1.05, x)) * 3.0;
      // Fırlatılan malzemenin bıraktığı ışınsal izler
      vec3 t1 = normalize(cross(uImpactDir[i], vec3(0.0, 1.0, 0.01)));
      vec3 t2 = cross(uImpactDir[i], t1);
      float ang = atan(dot(dir, t2), dot(dir, t1));
      float rays = pow(noise1(ang * 9.0 + float(i) * 7.0), 3.0);
      ejecta = max(ejecta, rays * smoothstep(3.0, 1.0, x) * step(1.0, x) * (1.0 - smoothstep(0.0, 0.25, uImpactAge[i])));
    }
  }

  // Okyanuslar zamanla en alçak yerlerden dolarak yükselir
  float waterLevel = mix(uHeightMin - 0.01, uSeaLevel, uOceanFill);
  float depth = waterLevel - h;
  float isOcean = smoothstep(-0.004, 0.004, depth) * step(0.001, uOceanFill);
  float landH = clamp((h - uSeaLevel) / max(uHeightMax - uSeaLevel, 0.01), 0.0, 1.0);

  // Kilitli dönüşte yıldıza bakan yüz sıcak, gece yüzü donmuş
  float sunSide = NdotLs;

  // --- Kara rengi ---
  vec3 land = mix(uRockDark, uRockLight, smoothstep(0.2, 0.9, detail));
  // Çöl kuşakları (subtropikal) ve kuru bölgeler
  float wetness = moisture + uWater * 0.35 - smoothstep(0.15, 0.45, lat) * (1.0 - smoothstep(0.45, 0.7, lat)) * 0.25;
  if (uTidalLock > 0.5) wetness += 0.25 - smoothstep(-0.1, 0.8, sunSide) * 0.5;
  float desert = smoothstep(0.62, 0.38, wetness) * (1.0 - landH * 0.8);
  land = mix(land, uSand, desert * 0.7 * step(0.05, uWater + 0.06));
  // Kurumuş havzalar (okyanus yoksa)
  float basin = smoothstep(0.0, 0.08, uSeaLevel - h) * (1.0 - isOcean);
  land = mix(land, toneLinear(vec3(0.78, 0.74, 0.66)), basin * 0.45 * step(0.02, uWater));
  // Krater çanakları biraz koyu
  land *= 1.0 - max(0.0, -crater) * uCraters * 0.35;
  land *= 1.0 - impactBowl * 0.35;
  land = mix(land, toneLinear(vec3(0.75, 0.72, 0.68)), ejecta * 0.5);

  // Bitki örtüsü
  float vegMask = smoothstep(0.42, 0.62, wetness) * (1.0 - smoothstep(0.55, 0.85, landH)) * uVegetation;
  vegMask *= 1.0 - smoothstep(uIceLine - 0.25, uIceLine - 0.05, lat);
  if (uTidalLock > 0.5) vegMask *= 1.0 - smoothstep(0.2, 0.55, abs(sunSide));
  vec3 vegColor = uVegColor * (0.7 + 0.6 * detail);
  land = mix(land, vegColor, clamp(vegMask, 0.0, 1.0));

  // Isı: kavrulmuş yüzey
  land = mix(land, land * vec3(0.55, 0.42, 0.36), uHeat * 0.7);

  // --- Okyanus rengi ---
  vec3 ocean = mix(uShallow, uDeep, smoothstep(0.0, 0.35, depth));
  ocean = mix(ocean, toneLinear(vec3(0.08, 0.32, 0.28)), uMicrobes * 0.35 * (1.0 - smoothstep(0.0, 0.15, depth)));
  ocean = mix(ocean, ocean * vec3(0.8, 0.75, 0.6), uHeat);

  vec3 albedo = mix(land, ocean, isOcean);

  // --- Buz ---
  float iceWobble = (detail - 0.5) * 0.12 + (moisture - 0.5) * 0.08;
  float polarIce = smoothstep(uIceLine - 0.03, uIceLine + 0.03, lat + iceWobble);
  if (uTidalLock > 0.5) polarIce = max(polarIce * 0.3, smoothstep(-0.2, -0.45, sunSide + iceWobble));
  float mountainSnow = smoothstep(0.72, 0.9, landH + (1.0 - uIceLine) * 0.6) * (1.0 - isOcean) * step(0.02, uWater);
  float seaIce = isOcean * max(uSeaIce * smoothstep(0.3, 0.6, detail + uSeaIce * 0.6), polarIce);
  float ice = clamp(max(max(polarIce * step(0.02, uWater), mountainSnow), seaIce), 0.0, 1.0) * (1.0 - uMolten);
  vec3 iceColor = toneLinear(vec3(0.9, 0.94, 0.98)) * (0.85 + 0.15 * detail);
  // Yer altı okyanusu: buzda kızıl çatlaklar (Europa gibi)
  float cracks = (1.0 - smoothstep(0.0, 0.012, abs(detail - 0.5))) + (1.0 - smoothstep(0.0, 0.01, abs(moisture - 0.47))) * 0.8;
  iceColor = mix(iceColor, toneLinear(vec3(0.55, 0.3, 0.2)), clamp(cracks, 0.0, 1.0) * uIceCracks * 0.75);
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
  emissive += impactGlow;

  // Volkanik lav damarları
  float lavaMask = smoothstep(0.78, 0.9, detail) * smoothstep(0.1, 0.6, landH + 0.2) * (1.0 - isOcean) * uLava * (1.0 - ice);
  emissive += toneLinear(vec3(1.0, 0.38, 0.08)) * lavaMask * 1.6;
  // Çok sıcak yüzey kızıl parlar
  emissive += toneLinear(vec3(0.7, 0.18, 0.05)) * smoothstep(0.75, 1.0, uHeat) * (0.3 + 0.7 * detail) * 0.6;

  // --- Aydınlatma ---
  float bumpAmount = uBump * (1.0 - isOcean) * (1.0 - ice * 0.6);
  vec3 Nb = perturbNormal(vWorldPos, N, h * bumpAmount * uPlanetRadius);
  float NdotL = dot(Nb, L);
  // Atmosfer alacakaranlığı yumuşatır
  float wrap = 0.15 * uHaze;
  float diffuse = clamp((NdotL + wrap) / (1.0 + wrap), 0.0, 1.0);
  float diffuse2 = clamp((dot(Nb, L2) + wrap) / (1.0 + wrap), 0.0, 1.0);

  // Bulut gölgesi
  float cloudShadow = cloudDensity(uTexB, dir, uCloudTime, uCloudCover) * 0.45;

  vec3 light = uSunColor * diffuse * (1.0 - cloudShadow) * (1.0 - ringShadowAt(vWorldPos, L)) + uSun2Color * diffuse2 * (1.0 - cloudShadow);
  vec3 ambient = uSkyColor * 0.02 * uHaze + vec3(0.006);
  vec3 col = albedo * (light + ambient);

  // Okyanus parlaması
  vec3 Hh = normalize(L + V);
  float spec = pow(max(dot(N, Hh), 0.0), 90.0) * isOcean * (1.0 - ice) * step(0.0, NdotLs);
  col += uSunColor * spec * 0.6 * (1.0 - cloudShadow);

  // Gece tarafı: şehir ışıkları
  float hasSun2 = step(0.001, length(uSun2Color));
  float night = min(smoothstep(0.08, -0.18, NdotLs), mix(1.0, smoothstep(0.08, -0.18, NdotL2s), hasSun2));
  float cityMask = smoothstep(0.62, 0.78, B.b) * (1.0 - isOcean) * (1.0 - ice) * (1.0 - smoothstep(0.35, 0.7, landH));
  cityMask *= smoothstep(0.0, 0.15, h - uSeaLevel + 0.15) * 0.6 + 0.4 * smoothstep(0.66, 0.74, B.b);
  emissive += toneLinear(vec3(1.0, 0.78, 0.45)) * cityMask * uCities * night * 1.4;

  // Kutup ışıkları
  float aLat = lat + (detail - 0.5) * 0.06;
  float auroraBand = smoothstep(0.80, 0.86, aLat) * (1.0 - smoothstep(0.9, 0.95, aLat));
  float flicker = 0.6 + 0.4 * sin(uTime * 2.0 + atan(dir.z, dir.x) * 12.0 + moisture * 6.0);
  vec3 auroraCol = mix(vec3(0.15, 1.0, 0.45), vec3(0.6, 0.25, 1.0), smoothstep(0.88, 0.94, lat));
  emissive += auroraCol * auroraBand * uAurora * night * flicker * 0.7;

  col += emissive;

  // Sanayi dumanı
  float dayside = smoothstep(-0.25, 0.4, NdotLs);
  col = mix(col, toneLinear(vec3(0.5, 0.47, 0.42)) * (uSunColor * diffuse + 0.01), uSmog * 0.3 * (1.0 - isOcean * 0.5));

  // Atmosfer kenar saçılması (gündüz tarafı)
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.5);
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
uniform vec3 uSun2Dir;
uniform vec3 uSun2Color;
uniform vec3 uCloudColor;
uniform vec3 uSkyColor;
uniform float uCloudTime;
uniform float uTime;
uniform float uCover;
uniform float uOpacity;
uniform float uStorms;
uniform vec3 uStormCenters[3];

COMMON_GLSL

void main() {
  vec3 dir = normalize(vObjDir);
  float d = cloudDensity(uTexB, dir, uCloudTime, uCover);
  vec2 uv = dirToUv(dir);
  float storm = texture2D(uTexB, uv).a;
  d *= 0.8 + 0.3 * storm;

  // Fırtına girdapları
  if (uStorms > 0.05 && uCover > 0.01) {
    for (int i = 0; i < 3; i++) {
      vec3 c = uStormCenters[i];
      float dist = acos(clamp(dot(dir, c), -1.0, 1.0));
      float R = 0.22 * uStorms + 0.04;
      if (dist < R) {
        vec3 t1 = normalize(cross(c, vec3(0.0, 1.0, 0.01)));
        vec3 t2 = cross(c, t1);
        float ang = atan(dot(dir, t2), dot(dir, t1));
        float spin = c.y > 0.0 ? 1.0 : -1.0;
        float spiral = 0.5 + 0.5 * sin(ang * 2.0 * spin + dist * 40.0 - uTime * 1.5);
        float k = 1.0 - dist / R;
        d = max(d, k * spiral * 1.1 * smoothstep(0.0, 0.3, uStorms));
        d *= smoothstep(0.0, 0.012, dist);
      }
    }
  }

  if (d < 0.01) discard;
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uSunDir);
  float NdotL = dot(N, L);
  float lit = clamp((NdotL + 0.2) / 1.2, 0.0, 1.0);
  float lit2 = clamp((dot(N, normalize(uSun2Dir)) + 0.2) / 1.2, 0.0, 1.0);
  // Alacakaranlıkta bulutlar kızarır
  vec3 sunset = mix(vec3(1.0, 0.45, 0.2), vec3(1.0), smoothstep(0.0, 0.35, NdotL));
  vec3 col = toneLinear(uCloudColor) * (uSunColor * sunset * lit + uSun2Color * lit2) + uSkyColor * 0.02;
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
uniform vec3 uSun2Dir;
uniform vec3 uSun2Color;
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
  float day2 = smoothstep(-0.35, 0.3, dot(normalize(closest), normalize(uSun2Dir)));
  vec3 dusk = mix(vec3(1.0, 0.4, 0.15), vec3(1.0), smoothstep(-0.1, 0.35, sunSide));
  vec3 col = uSkyColor * (uSunColor * dusk * day + uSun2Color * day2) * glow * 1.6;
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
uniform vec3 uSun2Dir;
uniform vec3 uSun2Color;
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
  float facing2 = abs(dot(uRingNormal, normalize(uSun2Dir)));
  vec3 V = normalize(cameraPosition - vWorldPos);
  // Toz halkalar arkadan aydınlanınca parlar (ileri saçılma)
  float forward = pow(max(dot(-V, L), 0.0), 6.0) * uScatter;
  float shade = 0.25 + 0.75 * facing + forward * 2.0;
  float band = 0.75 + 0.5 * noise1(r * 300.0 + uSeed);
  vec3 col = toneLinear(uColor) * band * (uSunColor * shade * (1.0 - shadow * 0.92) + uSun2Color * (0.25 + 0.75 * facing2));
  gl_FragColor = vec4(col, dens * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function withCommon(src: string): string {
  return src.replace('COMMON_GLSL', commonGLSL);
}
