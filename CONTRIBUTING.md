# Katkı rehberi

Gezegen Atölyesi'ne katkı vermek istediğin için teşekkürler! 🪐
*English speakers: contributions in English are welcome too — see the short section at the bottom.*

## Nereden başlamalı?

- [`good first issue`](https://github.com/MesutYilmazJS/gezegen-atolyesi/labels/good%20first%20issue) etiketli işler küçük ve iyi tanımlıdır.
- [`help wanted`](https://github.com/MesutYilmazJS/gezegen-atolyesi/labels/help%20wanted) etiketli işlerde özellikle yardıma ihtiyacımız var.
- Bir fikrin mi var? Önce bir [issue](https://github.com/MesutYilmazJS/gezegen-atolyesi/issues/new/choose) açıp konuşalım.

Katkı türleri: hata düzeltme, yeni özellik, performans, erişilebilirlik, çeviri, bilimsel doğruluk, yeni gerçek gezegen, Blender modeli, dokümantasyon.

## Geliştirme ortamı

```bash
git clone https://github.com/<kullanıcı-adın>/gezegen-atolyesi.git
cd gezegen-atolyesi
npm install
npm run dev
```

Göndermeden önce derlemenin geçtiğinden emin ol:

```bash
npm run build
```

Blender modellerini değiştirdiysen (isteğe bağlı, Blender 4.2+):

```bash
npm run blender
```

## Kod düzeni

- **TypeScript, katı mod.** `any` yerine doğru türleri kullan.
- **Arayüz metinleri** yalnızca [`src/i18n/tr.ts`](src/i18n/tr.ts) içinde durur; koda doğrudan metin yazma.
- **Yorumlar Türkçe**, kısa ve "neden"i anlatan türde.
- **Simülasyon** (`src/sim`) saf fonksiyonlardan oluşur; görsellik ve arayüz kodu içermez.
- **Shader'lar** `src/render/shaders` altında; yeni uniform eklerken `PlanetSystem` içinde hem tanımla hem güncelle.
- **İkonlar** [Lucide](https://lucide.dev) paketinden, `src/ui/icons.ts` üzerinden kullanılır.
- Telefon performansını unutma: her karede çalışan koda ağır hesap ekleme.

## Commit ve pull request

1. `main` dalından yeni bir dal aç: `ozellik/kisa-ad` veya `duzeltme/kisa-ad`.
2. Küçük ve anlamlı commit'ler at. Mesajlar Türkçe ya da İngilizce olabilir.
3. Pull request açıklamasında **ne değişti, neden ve nasıl denendi** kısmını doldur; görsel değişikliklerde ekran görüntüsü ekle.
4. CI (tür denetimi + derleme) yeşil olmalı; yerelde `npm run build` ile deneyebilirsin.

## Bilimsel doğruluk

Hesaplar bilerek basitleştirilmiştir; amaç oyun içinde **mantıklı ve öğretici** sonuçlardır. Bir formülü iyileştirirsen PR açıklamasına kaynağını ekle ve Dünya'nın varsayılan ayarlarda hâlâ ~14 °C, 1 bar ve ~100 yaşanabilirlik verdiğini kontrol et.

## Davranış kuralları

Bu projede herkesin kendini rahat hissetmesini istiyoruz. Lütfen [Davranış Kuralları](CODE_OF_CONDUCT.md)'na uy.

---

### English

Thanks for your interest! Fork the repo, create a branch from `main`, run `npm install && npm run dev`, and make sure `npm run build` passes before opening a pull request. UI strings live in `src/i18n/tr.ts` — adding `en.ts` with the same keys (plus a language switch) is one of the most wanted contributions. Please describe what changed, why, and how you tested it.
