const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

// --- 1. PREMIUM MARKET EŞYALARI ---
// rarity: 1 (Normal-Gri), 2 (Nadir-Mavi), 3 (Destansı-Mor), 4 (Efsanevi-Altın)
const MARKET_ITEMS = [
    { id: 'kilic_1', ad: 'Acemi Kılıcı', tur: 'silah', deger: 10, fiyat: 200, rarity: 1, resim: '🗡️' },
    { id: 'zirh_1', ad: 'Deri Yelek', tur: 'zirh', deger: 10, fiyat: 300, rarity: 1, resim: '👕' },
    
    { id: 'kilic_2', ad: 'Muhafız Kılıcı', tur: 'silah', deger: 35, fiyat: 1500, rarity: 2, resim: '⚔️' },
    { id: 'zirh_2', ad: 'Çelik Zırh', tur: 'zirh', deger: 30, fiyat: 1800, rarity: 2, resim: '🛡️' },

    { id: 'hancer_1', ad: 'Gölge Hançeri', tur: 'silah', deger: 80, fiyat: 5000, rarity: 3, resim: '🔪' },
    { id: 'asa_1', ad: 'Kızıl Ateş Asası', tur: 'silah', deger: 90, fiyat: 6500, rarity: 3, resim: '🔥' },
    
    { id: 'zirh_3', ad: 'Kara Şövalye Zırhı', tur: 'zirh', deger: 100, fiyat: 10000, rarity: 4, resim: '🌑' },
    { id: 'kilic_3', ad: 'Tanrıların Gazabı', tur: 'silah', deger: 200, fiyat: 25000, rarity: 4, resim: '⚡' }
];

// --- 2. VERİTABANI BAĞLANTISI ---
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
    enerji: { type: Number, default: 100 },
    sonEnerjiTarihi: { type: Date, default: Date.now },
    zindanSeviyesi: { type: Number, default: 1 },
    envanter: { type: [String], default: [] },
    saldiriGucu: { type: Number, default: 10 },
    savunmaGucu: { type: Number, default: 5 }
});

const Oyuncu = mongoose.model('Oyuncu', OyuncuSchema);

// --- 3. GÜÇ VE ENERJİ HESAPLAMA ---
function enerjiHesapla(oyuncu) {
    // DEV MODE: Enerji her zaman full (Sınırsız test için)
    oyuncu.enerji = 100; 
    return oyuncu;
}

function gucHesapla(oyuncu) {
    let toplamSaldiri = oyuncu.saldiriGucu + (oyuncu.seviye * 5);
    let toplamSavunma = oyuncu.savunmaGucu + (oyuncu.seviye * 3);

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

app.get('/api/user/:id', async (req, res) => {
    try {
        let oyuncu = await Oyuncu.findOne({ telegramId: req.params.id });
        if (!oyuncu) return res.json({ error: 'Kayıt yok' });
        
        oyuncu = enerjiHesapla(oyuncu);
        await oyuncu.save();
        
        const guc = gucHesapla(oyuncu);
        res.json({ ...oyuncu.toObject(), ...guc });
    } catch (e) { res.json({ error: 'Hata' }); }
});

app.get('/api/market', (req, res) => res.json(MARKET_ITEMS));

app.post('/api/satin-al', async (req, res) => {
    const { telegramId, itemId } = req.body;
    let oyuncu = await Oyuncu.findOne({ telegramId });
    const esya = MARKET_ITEMS.find(i => i.id === itemId);

    if (!esya) return res.json({ error: 'Eşya bulunamadı.' });
    if (oyuncu.envanter.includes(itemId)) return res.json({ error: 'Bu eşyaya zaten sahipsin!' });
    if (oyuncu.altin < esya.fiyat) return res.json({ error: 'Altının yetersiz!' });

    oyuncu.altin -= esya.fiyat;
    oyuncu.envanter.push(itemId);
    await oyuncu.save();
    
    res.json({ success: true, mesaj: `${esya.ad} envanterine eklendi!`, yeniAltin: oyuncu.altin });
});

app.post('/api/savas', async (req, res) => {
    const { telegramId } = req.body;
    let oyuncu = await Oyuncu.findOne({ telegramId });

    // DEV MODE: Enerji düşmüyoruz
    // oyuncu.enerji -= 10; 
    
    const guc = gucHesapla(oyuncu);
    
    // Düşman zorluğu her katta artar
    const dusmanGucu = (oyuncu.zindanSeviyesi * 25) + Math.floor(Math.random() * 20);
    const bossMu = oyuncu.zindanSeviyesi % 10 === 0; // Her 10. kat boss
    
    // Kritik vuruş şansı (%10)
    let oyuncuVurus = Math.random() * guc.saldiri;
    if(Math.random() > 0.9) oyuncuVurus *= 2; // Kritik!

    const dusmanVurus = Math.random() * dusmanGucu;

    let sonuc = {};

    if (oyuncuVurus > dusmanVurus) {
        // KAZANMA
        const temelAltin = (oyuncu.zindanSeviyesi * 30);
        const temelXp = (oyuncu.zindanSeviyesi * 20);
        
        oyuncu.altin += temelAltin;
        oyuncu.xp += temelXp;

        // Seviye Atlama
        const gerekenXp = oyuncu.seviye * 150;
        let seviyeMesaj = "";
        if (oyuncu.xp >= gerekenXp) {
            oyuncu.seviye++;
            oyuncu.xp = 0;
            oyuncu.altin += 500; // Seviye ödülü
            seviyeMesaj = `\n🆙 SEVİYE ATLADIN! Lvl ${oyuncu.seviye}`;
        }

        // Zindan İlerlemesi
        let zindanMesaj = "";
        if(bossMu) {
            zindanMesaj = "\n👑 BOSS'U YENDİN! (+1000 Altın)";
            oyuncu.altin += 1000;
            oyuncu.zindanSeviyesi++;
        } else {
            oyuncu.zindanSeviyesi++;
        }

        sonuc = {
            kazandimi: true,
            mesaj: "ZAFER!",
            detay: `Kazanç: ${temelAltin} Altın, ${temelXp} XP${seviyeMesaj}${zindanMesaj}`
        };
    } else {
        // KAYBETME (Zindan seviyesi düşmez)
        sonuc = {
            kazandimi: false,
            mesaj: "YENİLGİ...",
            detay: "Düşman çok güçlüydü. Marketten eşya alıp güçlenmelisin!"
        };
    }

    await oyuncu.save();
    res.json({ ...sonuc, yeniEnerji: 100, yeniAltin: oyuncu.altin, yeniXp: oyuncu.xp, zindan: oyuncu.zindanSeviyesi });
});

// Web ve Bot Başlatma
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(port, () => console.log(`🚀 RPG Sistem Aktif: ${port}`));

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start(async (ctx) => {
    const id = ctx.from.id;
    let oyuncu = await Oyuncu.findOne({ telegramId: id });
    if (!oyuncu) {
        oyuncu = new Oyuncu({ telegramId: id, isim: ctx.from.first_name });
        await oyuncu.save();
    }
    
    if(!oyuncu.klan) {
        ctx.reply('RPG Dünyasına Hoş Geldin! Tarafını seç:', Markup.inlineKeyboard([
            [Markup.button.callback('🔥 Ateş', 'sec_ates'), Markup.button.callback('🌊 Su', 'sec_su')],
            [Markup.button.callback('⛰️ Toprak', 'sec_toprak')]
        ]));
    } else {
        ctx.replyWithPhoto('https://wallpapers.com/images/hd/fantasy-knight-dark-art-u5k5w2y5z5x5v5.jpg', {
            caption: `⚔️ Savaşçı ${oyuncu.isim}\n\nHazırsan Arena seni bekliyor!`,
            ...Markup.inlineKeyboard([[Markup.button.webApp('🎮 OYUNA GİR (WEB)', 'https://klan-oyunu.onrender.com')]])
        });
    }
});

const klanSec = async (ctx, klanAdi) => {
    let oyuncu = await Oyuncu.findOne({ telegramId: ctx.from.id });
    if(oyuncu.klan) return ctx.reply('Zaten klanın var.');
    oyuncu.klan = klanAdi;
    oyuncu.altin = 1000; // Başlangıç parası arttı
    await oyuncu.save();
    ctx.reply(`Hoş geldin ${klanAdi} savaşçısı! 1000 Altın hesabına yattı.`, Markup.inlineKeyboard([
        [Markup.button.webApp('🎮 OYUNA GİR', 'https://klan-oyunu.onrender.com')]
    ]));
};
bot.action('sec_ates', (ctx) => klanSec(ctx, 'Ateş'));
bot.action('sec_su', (ctx) => klanSec(ctx, 'Su'));
bot.action('sec_toprak', (ctx) => klanSec(ctx, 'Toprak'));
bot.command('sifirla', async (ctx) => {
    await Oyuncu.deleteOne({ telegramId: ctx.from.id });
    ctx.reply('Sıfırlandın. /start yaz.');
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));