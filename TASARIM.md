# Gezegen Atölyesi — Oyun Tasarım Belgesi

**Tek cümleyle:** Ayarlarla oynayarak kendi gezegenini yarattığın, gezegenin gözünün önünde değiştiği ve üzerinde yaşamın doğup gelişmesini izlediğin bir yaratım ve keşif oyunu.

**Kimler için:** Uzay meraklıları, çocuklar ve gençler (eğitici yanı var), rahatlatıcı "sandbox" oyunları sevenler.

**Platformlar:** Web (bilgisayar), tablet, mobil — tek bir web uygulaması olarak.

---

## Claude Code için talimat

- Bu belge oyunun tam tasarımıdır. **Önce yalnızca "Sürüm 1" kapsamını yap** (bkz. Bölüm 15), çalışır hale getir, sonra sonraki sürümlere geç.
- Önerilen teknoloji:
  - **Vite + TypeScript** proje yapısı
  - **Three.js** ile 3D gezegen; yüzey, bulut, atmosfer ve halkalar için özel shader'lar (gürültü/noise tabanlı prosedürel üretim)
  - Arayüz için hafif bir yapı (sade TypeScript veya React — tercih Claude Code'a bırakıldı)
  - **PWA** (manifest + service worker) ile ana ekrana ekleme ve çevrimdışı çalışma
  - Kayıtlar Sürüm 1'de tarayıcıda (localStorage/IndexedDB); Sürüm 3'te Supabase
  - Yayın: Netlify
  - 3D modeller: Blender → GLB/glTF (Draco sıkıştırmalı), `GLTFLoader` ile yüklenir
- Gezegen **her zaman kodla, canlı olarak** üretilir. Blender yalnızca gezegenin etrafındaki parçalar için kullanılır (Bölüm 14).
- Arayüz dili Türkçe olsun, metinler ileride İngilizce eklenebilecek şekilde tek bir dil dosyasında dursun.
- Mobil performans önceliklidir: telefonda akıcı çalışmazsa kalite otomatik düşsün.

---

## 1. Platformlar: Web, Tablet, Mobil

- **Tek uygulama, her cihaz:** Aynı oyun bilgisayar tarayıcısında, tablette ve telefonda çalışır. Ekran boyutuna göre düzen kendini ayarlar.
- **Ana ekrana eklenebilir (PWA):** Telefonda "Ana ekrana ekle" denince normal bir uygulama gibi tam ekran açılır, simgesi olur.
- **İnternetsiz çalışma:** Bir kez açıldıktan sonra internet olmadan da oynanabilir.
- **Kontroller:**
  - **Bilgisayar:** Fareyle sürükleyip döndürme, tekerlekle yakınlaştırma, klavye kısayolları.
  - **Tablet/telefon:** Tek parmakla döndürme, iki parmakla yakınlaştırma, çift dokunuşla gezegene odaklanma.
- **Ekran düzenleri:**
  - **Bilgisayar ve yatay tablet:** Ortada gezegen, solda ayar paneli, sağda yaşam raporu.
  - **Telefon:** Gezegen tam ekran, ayarlar alttan yukarı kayan bir çekmecede (kategoriler sekmelerle), rapor ayrı bir sekmede.
- **Performans ayarı:** Eski telefonlar için "Düşük / Orta / Yüksek" grafik kalitesi; pil tasarrufu modu.

---

## 2. Oyun Döngüsü

1. Yıldızını seç
2. Gezegenini şekillendir (ayarlar)
3. Sonucu gör (3D gezegen anında değişir)
4. Zamanı ilerlet (evrim)
5. Yaşam raporunu oku, puanını gör
6. Kaydet, paylaş ya da görevi tamamla → yeni ödüller ve ayarların kilidi açılır

---

## 3. Ayarlar (kategorilere ayrılmış)

**Yıldız**
- Yıldız türü: Kırmızı cüce, turuncu cüce, sarı (Güneş benzeri), beyaz, mavi dev
- Çift yıldız sistemi (gökyüzünde iki güneş)

**Yörünge**
- Yıldıza uzaklık
- Yörünge şekli (dairesel ↔ basık)
- Eksen eğikliği (mevsimler)
- Gün uzunluğu
- Kilitli dönüş (bir yüz hep gündüz, arada yaşanabilir "alacakaranlık kuşağı")

**Gezegen yapısı**
- Büyüklük ve yerçekimi
- Gezegen yaşı
- Tektonik hareket (dağlar, kıtalar, adalar)
- Volkanik aktivite
- Krater yoğunluğu
- Toprak rengi ve mineraller (demirli kızıl çöller, tuz düzlükleri, kükürtlü sarı bölgeler)

**Su**
- Su miktarı (çöl ↔ okyanus dünyası)
- Okyanus türü (tatlı, tuzlu, sıvı metan)
- Gelgit gücü
- Yer altı okyanusu (Europa gibi)

**Atmosfer**
- Atmosfer kalınlığı
- Bileşim (oksijen, CO₂, metan, azot) → gökyüzü rengini belirler
- Bulut yoğunluğu ve fırtınalar
- Rüzgâr hızı
- Manyetik alan (kutup ışıkları, radyasyon koruması, atmosfer kaybı)

**Çevre**
- Ay sayısı (0–3) ve büyüklükleri
- Halka sistemi (malzeme, kalınlık, renk, eğim)

**Yaşam ve zaman**
- Evrim süresi (zaman çizelgesi)
- Medeniyet seviyesi (yok, köyler, sanayi, uzay çağı)

Her ayarın yanında küçük bir **"?" bilgi butonu** olur. Örnek: "Eksen eğikliği nedir? Dünya'da 23,4°'dir ve mevsimleri bu yaratır."

---

## 4. Görsel Dünya

- **3D dönen gezegen:** Kıtalar, okyanuslar, buzullar, çöller, ormanlar, dağ gölgeleri.
- **Canlı efektler:** Hareket eden bulutlar, fırtına girdapları, lav ışıltısı, kutup ışıkları, atmosfer halesi.
- **Gece tarafı:** Medeniyet varsa şehir ışıkları.
- **Yıldız ışığı:** Yıldız türüne göre gezegeni aydınlatan ışığın rengi değişir (kızıl, sarı, mavimsi).
- **Arka plan:** Yıldızlı uzay, uzakta yıldızın kendisi, aylar yörüngede döner.
- **Yakınlaşma modu:** İyice yaklaşınca yüzeyden manzara görünümü ("gökyüzünde iki güneş ve halkalar").
- **Fotoğraf modu:** Arayüzü gizleyip açı seçerek duvar kâğıdı olarak görüntü indirme.

---

## 5. Yaşam Raporu (analiz paneli)

- **Temel değerler:** Ortalama, en yüksek ve en düşük sıcaklık; sıvı su var/yok; atmosfer basıncı; yerçekimi (Dünya'nın kaç katı).
- **Yaşanabilirlik puanı (0–100)** ve renkli gösterge.
- **Dünya'ya benzerlik yüzdesi.**
- **Yaşam tahmini:** Koşullara göre üretilen açıklamalar, örneğin:
  - "Kızıl ışık nedeniyle bitkiler siyah renkte."
  - "Düşük yerçekiminde ağaçlar 200 metreye ulaşıyor."
  - "Yaşam sadece yer altı okyanusundaki sıcak su kaynaklarının çevresinde."
- **Tehlikeler:** "Manyetik alan zayıf; atmosfer yavaşça uzaya kaçıyor."
- **Gezegen hikâyesi:** Kısa, atmosferik bir paragraf. Bu dünyada bir gün nasıl geçer?

Hesaplamalar basitleştirilmiş ama mantıklı bilimsel kurallara dayanmalı (yıldız parlaklığı ve uzaklıktan denge sıcaklığı, sera etkisi, suyun sıvı kalabildiği aralık vb.).

---

## 6. Evrim ve Zaman Çizelgesi

Alttaki zaman kaydırıcısı ilerledikçe gezegen değişir:

1. **Doğuş:** Erimiş, lav kaplı bir küre
2. **Soğuma:** Kabuk oluşur, kraterler
3. **Okyanuslar:** Su birikir (koşullar uygunsa)
4. **İlk yaşam:** Okyanuslarda mikroplar
5. **Yeşillenme:** Kıtalar bitkilerle kaplanır
6. **Karmaşık canlılar**
7. **Medeniyet:** Şehir ışıkları, yörüngede uydular

Koşullar uygun değilse gezegen bir aşamada takılır ve rapor nedenini söyler: "Su çok erken buharlaştı."

---

## 7. Felaketler

Gezegene müdahale edip sonucunu izlersin:
- Göktaşı çarpması (yeni krater, toz bulutu, kısa süreli kış)
- Süper volkan
- Buzul çağı
- Yıldız patlaması (güneş fırtınası)
- Sera etkisi kaçağı (Venüs'e dönüşme)

Felaketten sonra yaşamın nasıl toparlandığı zaman çizelgesinde görülür.

---

## 8. Oyun Modları

- **Serbest yaratım:** Sınır yok, tüm ayarlar açık.
- **Görevler:** Hedefi olan bölümler, örneğin:
  - "Dünya'ya %90 benzeyen bir gezegen yap"
  - "Kırmızı cüce etrafında yaşanabilir bir dünya kur"
  - "Hem buzul hem çöl olan bir gezegen yarat"
  - "Medeniyeti bir göktaşı felaketinden kurtar"
- **Gerçek gezegenler:** Merkür, Venüs, Dünya, Mars, Jüpiter, Satürn ve bilinen ötegezegenler (TRAPPIST-1e, Proxima b gibi) hazır yüklenir; incelenip değiştirilebilir.
- **Günün gezegeni:** Her gün herkese aynı rastgele başlangıç ve aynı hedef; skor karşılaştırılır.
- **Rastgele gezegen:** Tek tuşla sürpriz dünya.

---

## 9. İlerleme ve Ödüller

- **Koleksiyon (gezegen albümü):** Kaydedilen gezegenler kartlar halinde; isim, tarih ve puanla.
- **Rozetler:** "İlk yaşam", "Halkaların efendisi", "Felaketten sağ çıkan", "İki güneş" gibi.
- **Kilit açma:** Bazı ayarlar ve yıldız türleri görevlerle açılır, böylece yeni oyuncu bunalmaz.
- **Ansiklopedi:** Oyunda karşılaşılan her kavram (sera etkisi, gelgit kilidi…) bir bilgi sayfası olarak açılır.

---

## 10. Paylaşım

- Gezegeni **link** olarak paylaşma; açan kişi aynı gezegeni görür ve üzerinde oynayabilir (gezegen ayarları + rastgelelik tohumu linke kodlanır).
- **Kart görseli:** Gezegenin görüntüsü, adı ve yaşanabilirlik puanıyla sosyal medyaya uygun bir kart.
- (İleride) **Topluluk galerisi:** Diğer oyuncuların gezegenlerini gezme ve beğenme.

---

## 11. Ses ve Atmosfer

- Sakin, uzay temalı ortam müziği
- Ayar değişince yumuşak ses efektleri (su dolması, rüzgâr, lav)
- Gezegenin durumuna göre değişen ambiyans (okyanus dünyasında dalga uğultusu)
- Müzik ve efektler ayrı ayrı açılıp kapatılabilir

---

## 12. Erişilebilirlik ve Ayarlar

- Türkçe ve İngilizce dil desteği
- Açık ve koyu tema
- Büyük yazı seçeneği
- Hareketi azalt seçeneği
- Renk körlüğüne uygun göstergeler

---

## 13. Görsel Tarz

- Hafif stilize, gerçekçiye yakın ama "çizgi film" değil; hem güzel durur hem telefonda hızlı çalışır.
- Arayüz sade ve yarı saydam paneller; gezegen her zaman ekranın yıldızı.
- Blender modelleri ve kodla üretilen gezegen aynı görsel dili paylaşmalı.

---

## 14. Blender ile Hazırlanacak Parçalar

**Önemli ayrım:** Gezegenin kendisi oyunda canlı olarak, kodla (Three.js) üretilir; çünkü her ayar değiştiğinde anında değişmesi gerekir. Blender gezegenin **etrafındaki her şeyi** daha kaliteli hale getirmek için kullanılır. Modeller GLB/glTF olarak dışa aktarılır ve oyun bunları tarayıcıda yükler.

**Oyun içi 3D modeller**
- **Keşif aracı (uzay sondası):** Gezegenin etrafında dönen, yakınlaştırınca detayları görünen küçük bir uydu.
- **Göktaşları ve kuyruklu yıldızlar:** Felaket animasyonları için.
- **Uzay istasyonu ve uydular:** Medeniyet "uzay çağına" geçince yörüngede beliren yapılar.
- **Düzensiz şekilli küçük aylar:** Phobos gibi patates şeklinde aylar.

**Yüzey manzaraları**
- "Yüzeyden bak" modu için hazır manzara sahneleri: çöl, buzul, okyanus kıyısı, volkanik ova, orman. Oyun gezegenin durumuna göre doğru sahneyi seçer; gökyüzü rengi, güneş sayısı, halkalar ve aylar kodla üzerine eklenir.
- Yaşam formları için stilize bitki ve canlı modelleri: siyah yapraklı ağaçlar, dev mantarlar, deniz canlıları.

**Doku ve görsel malzemeler**
- Krater, kaya, buz, kum gibi yüzey dokuları ve yükseklik haritaları
- Halka sistemi için ayrıntılı doku
- Arka plan için nebula ve yıldız alanı görselleri

**Tanıtım ve marka**
- Uygulama simgesi ve açılış ekranı görseli
- Rozet ikonları (3D render edilmiş madalyalar)
- Tanıtım videosu: Gezegenin oluşumundan medeniyete kadar sinematik bir fragman
- Mağaza ve web sitesi için yüksek kaliteli render'lar

**Teknik notlar**
- Mobil için modeller düşük poligonlu ve Draco ile sıkıştırılmış olmalı; yüksek kaliteli sürümler yalnızca "Yüksek" grafik ayarında yüklenir.
- Blender işleri Python betikleriyle (bpy) otomatikleştirilebilir; betikler projede `blender/` klasöründe tutulsun ki modeller yeniden üretilebilsin.

---

## 15. Yol Haritası

**Sürüm 1: Çekirdek oyun**
- 3D gezegen (prosedürel yüzey, bulutlar, atmosfer halesi, gece tarafı)
- Ayarlar: yıldız türü, yıldıza uzaklık, su miktarı, atmosfer kalınlığı, büyüklük, ay sayısı, halka sistemi, volkanik aktivite, evrim süresi
- Yaşam raporu ve yaşanabilirlik puanı
- Evrim zaman çizelgesi
- Kaydetme (tarayıcıda) ve rastgele gezegen
- Mobil, tablet ve masaüstü uyumu, dokunmatik kontroller, PWA
- Blender: uygulama simgesi, düzensiz aylar, göktaşı modeli

**Sürüm 2: Oyunlaştırma**
- Kalan tüm ayarlar
- Görevler, rozetler, kilit açma, ansiklopedi
- Gerçek gezegenler
- Felaketler
- Fotoğraf modu, ses ve müzik
- Blender: uzay sondası, felaket animasyonları, rozet ikonları, yüzey manzaraları

**Sürüm 3: Sosyal**
- Link ile paylaşım ve paylaşım kartı
- Günün gezegeni
- Hesap sistemi ve bulut kayıt (Supabase)
- Topluluk galerisi
- Kendi alan adıyla yayın (Netlify)
- İngilizce dil desteği
- Blender: uzay istasyonu, yaşam formu modelleri, tanıtım videosu
