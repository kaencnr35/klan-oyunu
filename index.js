const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

// --- 1. OYUN VERİLERİ VE MARKET ---
const MARKET_ITEMS = [
    { id: 'kilic_1', ad: 'Paslı Kılıç', tur: 'silah', deger: 5, fiyat: 200, resim: '🗡️' },
    { id: 'kilic_2', ad: 'Şövalye Kılıcı', tur: 'silah', deger: 15, fiyat: 1000, resim: '⚔️' },
    { id: 'asa_1', ad: 'Ateş Asası', tur: 'silah', deger: 25, fiyat: 2500, resim: '🔥' },
    { id: 'hancer_1', ad: 'Suikastçi Hançeri', tur: 'silah', deger: 40, fiyat: 5000, resim: '🔪' },
    { id: 'zirh_1', ad: 'Deri Zırh', tur: 'zirh', deger: 5, fiyat: 300, resim: '👕' },
    { id: 'zirh_2', ad: 'Demir Zırh', tur: 'zirh', deger: 15, fiyat: 1200, resim: '🛡️' },
    { id: 'zirh_3', ad: 'Ejderha Pulu Zırh', tur: 'zirh', deger: 30, fiyat: 6000, resim: '🐲' }
];

// --- 2. VERİTABANI ŞEMASI (RPG GÜNCELLEMESİ) ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Bağlandı!'))
    .catch(err => console.log('❌ DB Hatası:', err));

const OyuncuSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    isim: String,
    klan: { type: String, default: null },
    seviye: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    altin: { type: Number, default: 0 },
    // Yeni Özellikler
    enerji: { type: Number, default: 100 },
    sonEnerjiTarihi: { type: Date, default: Date.now },
    zindanSeviyesi: { type: Number, default: 1 }, // 1-10 arası
    envanter: { type: [String], default: [] }, // Satın alınan eşyaların ID'leri
    saldiriGucu: { type: Number, default: 10 }, // Temel güç
    savunmaGucu: { type: Number, default: 5 }   // Temel savunma
});

const Oyuncu = mongoose.model('Oyuncu', OyuncuSchema);

// --- 3. YARDIMCI FONKSİYONLAR ---

// Enerji Hesaplama (Saatte 100 Enerji)
function enerjiHesapla(oyuncu) {
    const simdi = new Date();
    const gecenSureMs = simdi - new Date(oyuncu.sonEnerjiTarihi);
    const gecenSaat = gecenSureMs / (1000 * 60 * 60);
    
    // Saatte 100 enerji yenilenir
    const kazanilanEnerji = Math.floor(gecenSaat * 100);
    
    if (kazanilanEnerji > 0) {
        let yeniEnerji = oyuncu.enerji + kazanilanEnerji;
        if (yeniEnerji > 200) yeniEnerji = 200; // Depo limiti 200
        
        oyuncu.enerji = yeniEnerji;
        oyuncu.sonEnerjiTarihi = simdi;
    }
    return oyuncu;
}

// Toplam Güç Hesaplama (Temel + Eşyalar)
function gucHesapla(oyuncu) {
    let toplamSaldiri = oyuncu.saldiriGucu + (oyuncu.seviye * 2);
    let toplamSavunma = oyuncu.savunmaGucu + (oyuncu.seviye * 2);

    oyuncu.envanter.forEach(itemId => {
        const esya = MARKET_ITEMS.find(i => i.id === itemId);
        if (esya) {
            if (esya.tur === 'silah') toplamSaldiri += esya.deger;
            if (esya.tur === 'zirh') toplamSavunma += esya.deger;
        }
    });

    return { saldiri: toplamSaldiri, savunma: toplamSavunma };
}

// --- 4. API ENDPOINTLERİ ---

// Bilgi Getir
app.get('/api/user/:id', async (req, res) => {
    try {
        let oyuncu = await Oyuncu.findOne({ telegramId: req.params.id });
        if (!oyuncu) return res.json({ error: 'Kayıt bulunamadı' });
        
        oyuncu = enerjiHesapla(oyuncu);
        await oyuncu.save();

        const guc = gucHesapla(oyuncu);
        res.json({ ...oyuncu.toObject(), ...guc });
    } catch (e) { res.json({ error: 'Hata' }); }
});

// Market Listesi
app.get('/api/market', (req, res) => {
    res.json(MARKET_ITEMS);
});

// Eşya Satın Al
app.post('/api/satin-al', async (req, res) => {
    const { telegramId, itemId } = req.body;
    let oyuncu = await Oyuncu.findOne({ telegramId });
    const esya = MARKET_ITEMS.find(i => i.id === itemId);

    if (!esya) return res.json({ error: 'Eşya yok.' });
    if (oyuncu.envanter.includes(itemId)) return res.json({ error: 'Buna zaten sahipsin!' });
    if (oyuncu.altin < esya.fiyat) return res.json({ error: 'Yetersiz Altın!' });

    oyuncu.altin -= esya.fiyat;
    oyuncu.envanter.push(itemId);
    await oyuncu.save();
    
    res.json({ success: true, mesaj: `${esya.ad} satın alındı!`, yeniAltin: oyuncu.altin });
});

// Savaş Sistemi
app.post('/api/savas', async (req, res) => {
    const { telegramId } = req.body;
    let oyuncu = await Oyuncu.findOne({ telegramId });
    
    // Enerji Kontrolü
    oyuncu = enerjiHesapla(oyuncu);
    if (oyuncu.enerji < 10) return res.json({ error: 'Enerjin yetersiz! (Gereken: 10)' });

    oyuncu.enerji -= 10; // Enerji düş

    const guc = gucHesapla(oyuncu);
    
    // Düşman Gücü (Zindan seviyesine göre artar)
    const dusmanGucu = (oyuncu.zindanSeviyesi * 15) + Math.floor(Math.random() * 20);
    const bossMu = oyuncu.zindanSeviyesi === 10;
    
    // Savaş Mantığı (Rastgelelik faktörü)
    const oyuncuZar = Math.random() * guc.saldiri;
    const dusmanZar = Math.random() * dusmanGucu;

    let sonuc = {};

    if (oyuncuZar > dusmanZar) {
        // KAZANDI
        const kazancAltin = (oyuncu.zindanSeviyesi * 20) + 10;
        const kazancXp = (oyuncu.zindanSeviyesi * 15) + 5;

        oyuncu.altin += kazancAltin;
        oyuncu.xp += kazancXp;

        // Seviye Atlama (Formül: Seviye * 100 XP)
        const gerekenXp = oyuncu.seviye * 100;
        let seviyeMesaj = "";
        if (oyuncu.xp >= gerekenXp) {
            oyuncu.seviye++;
            oyuncu.xp = 0; // XP sıfırlanır
            seviyeMesaj = `🆙 SEVİYE ATLADIN! (${oyuncu.seviye})`;
        }

        // Zindan İlerlemesi
        let zindanMesaj = "";
        if (oyuncu.zindanSeviyesi < 10) {
            oyuncu.zindanSeviyesi++;
            zindanMesaj = `Zindan ${oyuncu.zindanSeviyesi} kilidi açıldı!`;
        } else {
            // Boss kesildi, başa dön veya ödül ver
            zindanMesaj = "👑 BOSS YENDİN! BÜYÜK ÖDÜL!";
            oyuncu.altin += 500; // Boss bonusu
            oyuncu.zindanSeviyesi = 1; // Oyunu döngüye sokuyoruz (Prestige mantığı)
        }

        sonuc = {
            kazandimi: true,
            mesaj: bossMu ? "BOSS YOK EDİLDİ!" : "ZAFER!",
            detay: `+${kazancAltin} Altın | +${kazancXp} XP\n${seviyeMesaj}\n${zindanMesaj}`,
            canavarResmi: bossMu ? 'https://wallpapercave.com/wp/wp2040149.jpg' : null
        };
    } else {
        // KAYBETTİ
        sonuc = {
            kazandimi: false,
            mesaj: "YENİLGİ!",
            detay: "Düşman çok güçlüydü. Zırhını güçlendir!",
            zindanReset: false // Kaybedince zindan düşmüyor
        };
    }

    await oyuncu.save();
    res.json({ ...sonuc, yeniEnerji: oyuncu.enerji, yeniAltin: oyuncu.altin, yeniXp: oyuncu.xp });
});

// Web Sunucusu
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(port, () => console.log(`🚀 RPG Bot ${port} portunda!`));

// --- 5. TELEGRAM BOT KOMUTLARI ---
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start(async (ctx) => {
    // Oyuncuyu oluştur
    const id = ctx.from.id;
    let oyuncu = await Oyuncu.findOne({ telegramId: id });
    if (!oyuncu) {
        oyuncu = new Oyuncu({ telegramId: id, isim: ctx.from.first_name });
        await oyuncu.save();
    }
    
    if(!oyuncu.klan) {
        // Klan Seçimi
        ctx.reply('RPG Dünyasına Hoş Geldin! Önce klanını seç:', Markup.inlineKeyboard([
            [Markup.button.callback('🔥 Ateş', 'sec_ates'), Markup.button.callback('🌊 Su', 'sec_su')],
            [Markup.button.callback('⛰️ Toprak', 'sec_toprak')]
        ]));
    } else {
        // Oyuna Yönlendir
        ctx.replyWithPhoto('https://wallpapers.com/images/hd/fantasy-rpg-background-859h7y3z4k3l5m6n.jpg', {
            caption: `⚔️ Savaşçı ${oyuncu.isim}\n⚡ Enerji: ${Math.floor(oyuncu.enerji)}/200\n🏰 Zindan: ${oyuncu.zindanSeviyesi}. Kat`,
            ...Markup.inlineKeyboard([[Markup.button.webApp('🎮 OYUNA GİR', 'https://klan-oyunu.onrender.com')]])
        });
    }
});

// Klan Seçim Fonksiyonu
const klanSec = async (ctx, klanAdi) => {
    let oyuncu = await Oyuncu.findOne({ telegramId: ctx.from.id });
    if(oyuncu.klan) return ctx.reply('Zaten bir klanın var!');
    oyuncu.klan = klanAdi;
    oyuncu.altin = 500; // Başlangıç parası
    await oyuncu.save();
    ctx.reply(`Tebrikler ${klanAdi} klanındasın! +500 Altın hediyen verildi.`, Markup.inlineKeyboard([
        [Markup.button.webApp('🎮 OYUNA BAŞLA', 'https://klan-oyunu.onrender.com')]
    ]));
};
bot.action('sec_ates', (ctx) => klanSec(ctx, 'Ateş'));
bot.action('sec_su', (ctx) => klanSec(ctx, 'Su'));
bot.action('sec_toprak', (ctx) => klanSec(ctx, 'Toprak'));

bot.command('sifirla', async (ctx) => {
    await Oyuncu.deleteOne({ telegramId: ctx.from.id });
    ctx.reply('Hesabın silindi. /start ile baştan başla.');
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));