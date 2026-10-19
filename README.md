# Gezegen Atölyesi

Ayarlarla oynayarak kendi gezegenini yarattığın, gezegenin gözünün önünde değiştiği ve üzerinde yaşamın doğup gelişmesini izlediğin bir yaratım ve keşif oyunu. Tam tasarım için [TASARIM.md](TASARIM.md).

## Çalıştırma

```bash
npm install
npm run dev        # geliştirme sunucusu (telefondan da açılabilir: --host)
npm run build      # üretim derlemesi → dist/
npm run blender    # Blender modellerini ve simgeleri yeniden üret
```

## Sürüm 1 kapsamı

- Kodla, canlı üretilen 3B gezegen (Three.js): prosedürel yüzey, bulutlar, atmosfer halesi, gece tarafı ve şehir ışıkları, halkalar ve halka gölgeleri
- Ayarlar: yıldız türü, yıldıza uzaklık, büyüklük, volkanik aktivite, su miktarı, atmosfer kalınlığı, ay sayısı, halka sistemi (malzeme, genişlik, renk, eğim)
- Yaşam raporu: sıcaklıklar, sıvı su, basınç, yerçekimi, yaşanabilirlik puanı, Dünya'ya benzerlik, yaşam tahmini, tehlikeler, gezegen hikâyesi
- Evrim zaman çizelgesi (Doğuş → Medeniyet); koşullar uygun değilse evrim takılır ve nedeni gösterilir
- Tarayıcıda kayıt (albüm), rastgele gezegen
- Masaüstü, tablet, telefon düzeni; dokunmatik kontroller; PWA (ana ekrana ekleme, internetsiz çalışma)
- Blender: uygulama simgesi, düzensiz aylar, göktaşı modeli (`blender/` betikleri, Draco sıkıştırmalı GLB)

## Klasörler

| Klasör | İçerik |
| --- | --- |
| `src/sim` | Basitleştirilmiş fizik: sıcaklık, sera etkisi, su durumu, yaşanabilirlik, evrim |
| `src/render` | Three.js sahnesi; `shaders/` içinde yüzey "pişirme", gezegen, bulut, atmosfer ve halka shader'ları |
| `src/ui` | Ayar paneli, rapor, zaman çizelgesi, albüm ve seçenekler |
| `src/i18n` | Tüm arayüz metinleri (İngilizce için aynı yapıda `en.ts` eklenebilir) |
| `blender` | Modelleri ve simgeleri üreten Blender (bpy) betikleri |

## Performans

Gezegen yüzeyi yalnızca tohum değişince bir dokuya pişirilir; her karede yalnızca bu doku okunur. Grafik kalitesi "Otomatik" iken kare hızı düşerse kalite kendiliğinden azalır. Pil tasarrufu modu kare hızını 30'a sınırlar.

## Yayın

Netlify için `netlify.toml` hazır (`npm run build`, `dist/`).
