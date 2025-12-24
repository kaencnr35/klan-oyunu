const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const path = require('path');
require('dotenv').config();

// --- 1. EXPRESS WEB SUNUCUSU VE API ---
const app = express();
const port = process.env.PORT || 3000;

// JSON verilerini okuyabilmek için gerekli ayar
app.use(express.json());

// Ana sayfayı gönder
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// [API] Kullanıcı Bilgilerini Getir
app.get('/api/user/:id', async (req, res) => {
    try {
        const telegramId = req.params.id;
        let oyuncu = await Oyuncu.findOne({ telegramId });
        if (!oyuncu) return res.json({ error: 'Oyuncu bulunamadı' });
        res.json(oyuncu);
    } catch (e) {
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// [API] Savaş İşlemi (Web Sitesinden Tetiklenir)
app.post('/api/savas', async (req, res) => {
    try {
        const { telegramId } = req.body; // Web sitesinden gelen ID
        const oyuncu = await Oyuncu.findOne({ telegramId });

        if (!oyuncu) return res.json({ error: 'Oyuncu bulunamadı' });
        if (!oyuncu.klan) return res.json({ error: 'Klanın yok!' });

        // Savaş Mantığı
        const sans = Math.random();
        let sonuc = {};

        if (sans > 0.4) {
            const kazanc = Math.floor(Math.random() * 50) + 10;
            const xp = Math.floor(Math.random() * 15) + 5;
            
            oyuncu.altin += kazanc;
            oyuncu.xp += xp;
            await oyuncu.save();

            sonuc = {
                kazandimi: true,
                mesaj: `⚔️ ZAFER! Düşmanı yendin.`,
                detay: `+${kazanc} Altın | +${xp} XP`,
                yeniAltin: oyuncu.altin,
                yeniXp: oyuncu.xp
            };
        } else {
            sonuc = {
                kazandimi: false,
                mesaj: `💀 YENİLGİ!`,
                detay: `Düşman çok güçlüydü, kaçtın.`,
                yeniAltin: oyuncu.altin,
                yeniXp: oyuncu.xp
            };
        }
        res.json(sonuc); // Sonucu siteye geri gönder
    } catch (e) {
        console.log(e);
        res.status(500).json({ error: 'Savaş hatası' });
    }
});

app.listen(port, () => {
    console.log(`🌍 Web ve API ${port} portunda çalışıyor!`);
});

// --- 2. VERİTABANI ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Bağlandı!'))
    .catch(err => console.log('❌ Veritabanı Hatası:', err));

const OyuncuSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    isim: String,
    klan: { type: String, default: null },
    seviye: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    altin: { type: Number, default: 0 },
    sonGunlukOdul: { type: Date, default: null }
});
const Oyuncu = mongoose.model('Oyuncu', OyuncuSchema);

// --- 3. BOT AYARLARI ---
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.telegram.setMyCommands([
    { command: 'start', description: '⚔️ Menüyü Aç' },
    { command: 'sifirla', description: '🔄 Sıfırdan Başla' }
]);

// Yardımcı Fonksiyon
async function oyuncuGetir(ctx) {
    const id = ctx.from.id;
    let oyuncu = await Oyuncu.findOne({ telegramId: id });
    if (!oyuncu) {
        oyuncu = new Oyuncu({ telegramId: id, isim: ctx.from.first_name });
        await oyuncu.save();
    }
    return oyuncu;
}

// Bot Komutları
bot.start(async (ctx) => {
    const oyuncu = await oyuncuGetir(ctx);
    if (!oyuncu.klan) {
        ctx.reply('Hoş geldin! Önce bir klan seçmelisin:', Markup.inlineKeyboard([
            [Markup.button.callback('🔥 Ateş', 'sec_ates'), Markup.button.callback('🌊 Su', 'sec_su')],
            [Markup.button.callback('⛰️ Toprak', 'sec_toprak')]
        ]));
    } else {
        ctx.reply(`Savaşçı ${oyuncu.isim}, Arena seni bekliyor! 👇`, Markup.inlineKeyboard([
            [Markup.button.webApp('⚔️ ARENAYA GİR (OYNA)', 'https://klan-oyunu.onrender.com')]
        ]));
    }
});

// SIFIRLAMA
bot.command('sifirla', async (ctx) => {
    const oyuncu = await oyuncuGetir(ctx);
    oyuncu.klan = null;
    oyuncu.altin = 0;
    oyuncu.xp = 0;
    await oyuncu.save();
    ctx.reply('Hesabın sıfırlandı. /start yazarak tekrar başla.');
});

// KLAN SEÇİMİ
const klanSec = async (ctx, klanAdi) => {
    const oyuncu = await oyuncuGetir(ctx);
    if (oyuncu.klan) return ctx.reply('Zaten klanın var.');
    oyuncu.klan = klanAdi;
    oyuncu.altin = 100;
    await oyuncu.save();
    ctx.reply(`Tebrikler ${klanAdi} klanındasın! Şimdi arenaya gir:`, Markup.inlineKeyboard([
        [Markup.button.webApp('⚔️ ARENAYA GİR', 'https://klan-oyunu.onrender.com')]
    ]));
};
bot.action('sec_ates', (ctx) => klanSec(ctx, 'Ateş'));
bot.action('sec_su', (ctx) => klanSec(ctx, 'Su'));
bot.action('sec_toprak', (ctx) => klanSec(ctx, 'Toprak'));

bot.launch();
console.log('🤖 Bot Hazır!');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));