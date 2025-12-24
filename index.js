const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

// --- MARKET EŞYALARI (Görseller Emojiden Linke Döndü) ---
const MARKET_ITEMS = [
    { id: 'w_sword1', ad: 'Paslı Kılıç', tur: 'silah', deger: 15, fiyat: 150, rarity: 1, img: 'https://cdn-icons-png.flaticon.com/512/1037/1037974.png' },
    { id: 'a_leather', ad: 'Deri Zırh', tur: 'zirh', deger: 10, fiyat: 200, rarity: 1, img: 'https://cdn-icons-png.flaticon.com/512/2553/2553256.png' },
    
    { id: 'w_sword2', ad: 'Şövalye Kılıcı', tur: 'silah', deger: 40, fiyat: 1200, rarity: 2, img: 'https://cdn-icons-png.flaticon.com/512/861/861058.png' },
    { id: 'a_iron', ad: 'Çelik Zırh', tur: 'zirh', deger: 35, fiyat: 1500, rarity: 2, img: 'https://cdn-icons-png.flaticon.com/512/3026/3026369.png' },

    { id: 'w_axe', ad: 'Barbar Baltası', tur: 'silah', deger: 90, fiyat: 4500, rarity: 3, img: 'https://cdn-icons-png.flaticon.com/512/861/861088.png' },
    { id: 'w_staff', ad: 'Büyücü Asası', tur: 'silah', deger: 100, fiyat: 6000, rarity: 3, img: 'https://cdn-icons-png.flaticon.com/512/861/861066.png' },
    
    { id: 'w_legend', ad: 'Ejderha Katili', tur: 'silah', deger: 250, fiyat: 20000, rarity: 4, img: 'https://cdn-icons-png.flaticon.com/512/2275/2275685.png' }
];

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Hazır!'))
    .catch(err => console.log('❌ DB Hatası:', err));

const OyuncuSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    isim: String,
    klan: { type: String, default: null },
    seviye: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    altin: { type: Number, default: 200 }, // Başlangıç parası arttı
    enerji: { type: Number, default: 100 },
    sonEnerjiTarihi: { type: Date, default: Date.now },
    zindanSeviyesi: { type: Number, default: 1 },
    envanter: { type: [String], default: [] },
    saldiriGucu: { type: Number, default: 20 }, // Başlangıç gücü arttı
    savunmaGucu: { type: Number, default: 10 }
});
const Oyuncu = mongoose.model('Oyuncu', OyuncuSchema);

// Güç Hesaplama
function gucHesapla(oyuncu) {
    let toplamSaldiri = oyuncu.saldiriGucu + (oyuncu.seviye * 5);
    let toplamSavunma = oyuncu.savunmaGucu + (oyuncu.seviye * 5);

    oyuncu.envanter.forEach(itemId => {
        const esya = MARKET_ITEMS.find(i => i.id === itemId);
        if (esya) {
            if (esya.tur === 'silah') toplamSaldiri += esya.deger;
            if (esya.tur === 'zirh') toplamSavunma += esya.deger;
        }
    });
    return { saldiri: toplamSaldiri, savunma: toplamSavunma };
}

// --- API ENDPOINTLERİ ---

app.get('/api/user/:id', async (req, res) => {
    try {
        let oyuncu = await Oyuncu.findOne({ telegramId: req.params.id });
        if (!oyuncu) return res.json({ error: 'Kayıt yok' });
        
        // DEV MODE: Enerji hep full
        oyuncu.enerji = 100;
        await oyuncu.save();
        
        const guc = gucHesapla(oyuncu);
        // XP Barı için gereken XP hesaplama (Seviye * 100)
        const gerekenXp = oyuncu.seviye * 100;
        
        res.json({ ...oyuncu.toObject(), ...guc, gerekenXp });
    } catch (e) { res.json({ error: 'Hata' }); }
});

app.get('/api/market', (req, res) => res.json(MARKET_ITEMS));

app.post('/api/satin-al', async (req, res) => {
    const { telegramId, itemId } = req.body;
    let oyuncu = await Oyuncu.findOne({ telegramId });
    const esya = MARKET_ITEMS.find(i => i.id === itemId);

    if (oyuncu.envanter.includes(itemId)) return res.json({ error: 'Buna zaten sahipsin!' });
    if (oyuncu.altin < esya.fiyat) return res.json({ error: 'Altın yetersiz!' });

    oyuncu.altin -= esya.fiyat;
    oyuncu.envanter.push(itemId);
    await oyuncu.save();
    
    res.json({ success: true, mesaj: `${esya.ad} alındı!`, yeniAltin: oyuncu.altin });
});

// SAVAŞ MANTIĞI (DENGELENMİŞ)
app.post('/api/savas', async (req, res) => {
    const { telegramId } = req.body;
    let oyuncu = await Oyuncu.findOne({ telegramId });
    const guc = gucHesapla(oyuncu);
    
    // Düşman Gücü: Zindan başına artar ama oyuncudan çok güçlü olmaz
    // Formül: (Zindan * 15) + Rastgele(0-20)
    let dusmanGucu = (oyuncu.zindanSeviyesi * 15) + Math.floor(Math.random() * 20);
    
    // YENİ BAŞLAYAN KORUMASI: Eğer seviye < 3 ise düşman zayıf olsun
    if (oyuncu.seviye < 3) dusmanGucu = dusmanGucu * 0.5;

    // Savaş Zar Atma
    // Oyuncu: Gücü * (0.8 ile 1.2 arası şans)
    const oyuncuVurus = guc.saldiri * (0.8 + Math.random() * 0.4);
    const dusmanVurus = dusmanGucu * (0.5 + Math.random() * 0.5); // Düşman daha az stabil

    let sonuc = {};

    if (oyuncuVurus >= dusmanVurus) {
        // KAZANDI
        const kazanilanAltin = (oyuncu.zindanSeviyesi * 40) + 10;
        const kazanilanXp = (oyuncu.zindanSeviyesi * 25) + 5;
        
        oyuncu.altin += kazanilanAltin;
        oyuncu.xp += kazanilanXp;
        
        // Seviye Kontrolü
        const gerekenXp = oyuncu.seviye * 100;
        let lvlUp = false;
        if(oyuncu.xp >= gerekenXp) {
            oyuncu.seviye++;
            oyuncu.xp = 0; // XP sıfırla
            oyuncu.saldiriGucu += 5; // Kalıcı güç
            lvlUp = true;
        }

        // Kat İlerlemesi
        let katAtladi = false;
        if (Math.random() > 0.3) { // Her savaşta kat atlama garantisi yok, %70 şans
             oyuncu.zindanSeviyesi++;
             katAtladi = true;
        }

        sonuc = {
            durum: 'win',
            baslik: 'ZAFER!',
            mesaj: `Düşmanı ezdin geçtin!`,
            odul: `+${kazanilanAltin} Altın | +${kazanilanXp} XP`,
            ozel: lvlUp ? '🔥 SEVİYE ATLADIN!' : (katAtladi ? '🏰 BİR SONRAKİ KATA ÇIKTIN!' : '')
        };
    } else {
        // KAYBETTİ
        sonuc = {
            durum: 'lose',
            baslik: 'YENİLGİ...',
            mesaj: `Düşman (${Math.floor(dusmanGucu)} Güç) çok güçlü geldi.`,
            odul: 'Markete gidip eşya almalısın.',
            ozel: ''
        };
    }

    await oyuncu.save();
    res.json({ ...sonuc, yeniData: { altin: oyuncu.altin, xp: oyuncu.xp, lvl: oyuncu.seviye, zindan: oyuncu.zindanSeviyesi, gerekenXp: oyuncu.seviye*100 } });
});

// Server ve Bot
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(port, () => console.log(`RPG Engine Port: ${port}`));

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.start((ctx) => {
    ctx.replyWithPhoto('https://wallpapers.com/images/hd/fantasy-warrior-loading-screen-4k-rpg-7k5l6m.jpg', {
        caption: "⚔️ KLAN SAVAŞLARI RPG ⚔️\n\nArenaya gir ve kendini kanıtla!",
        ...Markup.inlineKeyboard([[Markup.button.webApp('🎮 OYUNA GİR', 'https://klan-oyunu.onrender.com')]])
    });
});
bot.command('sifirla', async (ctx) => {
    await Oyuncu.deleteOne({ telegramId: ctx.from.id });
    ctx.reply('Karakterin silindi. /start ile yeniden başla.');
});
bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));