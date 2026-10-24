# Coin Panosu

Binance verisiyle canlı çalışan kripto takip panosu ve "Kripto Alarm Sistemi v7" sinyal takipçisi.

**Panoyu aç:** https://okanasl2809.github.io/coin-panosu/

Bilgisayarda, tablette ve telefonda aynı linkle açılır. Telefonda ve tablette tarayıcı menüsünden **"Ana ekrana ekle"** dersen uygulama gibi simgesi olur.

## Panoda neler var
- **Bugün dikkat et:** SAT/STOP gelen, stopa yaklaşan, kâr kilidi basamağı geçen sinyaller ve riskli pozisyonlar tek yerde.
- **Sinyallerim:** TradingView v7 alarmlarını yapıştır ya da panonun otomatik taramasına bırak; her sinyal v7 kurallarıyla canlı izlenir.
- **v7 Bulut Takibi:** Bilgisayar kapalıyken bulutta çalışan alarmın sonuçları (sistemin pozisyonda olduğu coinler, son sinyaller). Her cihazda aynı.
- **Geriye dönük test**, Pump Radarı, hacim ve fiyat listeleri, pozisyon ve portföy riski, ana piyasalar, likidasyon haritası, alarm karnesi.
- Üstteki düğmelerle bölümlere hızlı geç; **Bölümleri seç** ile kullanmadıklarını gizle. Telefonda sağ alttaki **Bölümler** düğmesi başa döndürür.

## Cihazlar arası taşıma
Sinyallerin, pozisyonların ve ayarların her cihazın kendi tarayıcısında saklanır. Başka bir cihaza taşımak için:
1. Panoda sağdaki **Alarmlar** sütununda **Yedek ve diğer cihazlar** bölümünü aç, **Yedeği indir**'e bas.
2. İnen dosyayı diğer cihaza gönder (örneğin Telegram'da kendine at).
3. O cihazda aynı bölümden **Yedeği yükle**'ye bas ve dosyayı seç.

## Bilgisayar kapalıyken Telegram alarmı (bulut alarmı)
GitHub her 15 dakikada bir v7 kurallarını hesaplar ve yeni sinyalleri Telegram'a yollar: AL, SAT, STOP, kâr kilidi, pump ateşlemeleri, BTC rejimi değişimi ve her sabah 09:00 özeti.

Bir kez kurman yeterli:
1. Telegram'da **@BotFather**'a `/newbot` yaz, bir isim ver. Sana verdiği **anahtarı (token)** kopyala. (Panoda Telegram'ı kurduysan aynı anahtarı kullanabilirsin.)
2. Botuna bir mesaj yaz. Sonra panodaki Telegram bölümünde **Sohbet numarasını bul**'a bas ve çıkan numarayı kopyala.
3. Bu depoda **Settings → Secrets and variables → Actions → New repository secret** yolunu izle ve iki kayıt ekle:
   - Adı `TELEGRAM_TOKEN`, değeri: bot anahtarı
   - Adı `TELEGRAM_CHAT`, değeri: sohbet numarası
4. **Actions** sekmesinde **v7 bulut alarmı**'nı seç ve **Run workflow**'a bas. Birkaç dakika içinde sabah özeti gelirse kurulum tamamdır.

İzlenen coinleri ve zaman dilimlerini `alarm/config.json` dosyasından değiştirebilirsin. Varsayılan ayar: hacmi en yüksek 80 USDT coini, 4 saatlik ve günlük grafik, pump radarı açık.

Not: Depoda 60 gün hiç değişiklik olmazsa GitHub zamanlanmış çalışmayı durdurur. Durursa Actions sekmesinden yeniden açabilirsin.

## Dosyalar
- `index.html`: pano
- `v7.js`: v7 hesap motoru. Pano ve bulut alarmı aynı kuralları kullanır.
- `alarm/`: bulut alarmı betiği ve ayarları
- `.github/workflows/alarm.yml`: 15 dakikalık zamanlayıcı

Yatırım tavsiyesi değildir. Sinyaller ihtimal gösterir, kesinlik vermez.
