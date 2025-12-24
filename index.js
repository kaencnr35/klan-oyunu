const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const path = require('path');
require('dotenv').config();

// --- 1. EXPRESS WEB SUNUCUSU ---
const app = express();
const port = process.env.PORT || 3000;

// Ana sayfaya girince index.html dosyasını gönder
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Sunucuyu başlat
app.listen(port, () => {
    console.log(`🌍 Web Uygulaması ve Bot ${port} portunda çalışıyor!`);
});

// --- 2. VERİTABANI BAĞLANTISI ---
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

// Menü Komutlarını Ayarla
bot.telegram.setMyCommands([
    { command: 'start', description: '⚔️ Oyuna Başla' },
    { command: 'sifirla', description: '🔄 Oyunu Sıfırla (Baştan Başla)' },
    { command: 'savas', description: '⚔️ Savaş Yap' },
    { command: 'profil', description: '👤 Profilim' },
    { command: 'gunluk', description: '🎁 Günlük Ödül' },
    { command: 'site', description: '🌐 Arenayı Aç' }
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

// --- KOMUTLAR ---

// BAŞLANGIÇ
bot.start(async (ctx) => {
    const oyuncu = await oyuncuGetir(ctx);

    if (oyuncu.klan) {
        // Zaten klanı varsa
        ctx.reply(`Savaşçı ${oyuncu.isim}, zaten ${oyuncu.klan} klanındasın!\nSıfırdan başlamak istiyorsan: /sifirla yaz.`, 
            Markup.inlineKeyboard([
                [Markup.button.webApp('🌍 SAVAŞ ARENASINI AÇ', 'https://klan-oyunu.onrender.com')],
                [Markup.button.callback('⚔️ Savaş', 'savas_yap')]
            ])
        );
    } else {
        // Klanı yoksa veya sıfırlamışsa
        ctx.reply(`Hoş geldin ${oyuncu.isim}! ⚔️\nHenüz bir taraf seçmedin. Klanını seç ve savaşa katıl:`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🔥 Ateş', 'sec_ates'), Markup.button.callback('🌊 Su', 'sec_su')],
                [Markup.button.callback('⛰️ Toprak', 'sec_toprak')]
            ])
        );
    }
});

// SIFIRLAMA KOMUTU (YENİ)
bot.command('sifirla', async (ctx) => {
    const oyuncu = await oyuncuGetir(ctx);
    
    // Her şeyi sıfırlıyoruz
    oyuncu.klan = null;
    oyuncu.altin = 0;
    oyuncu.xp = 0;
    oyuncu.seviye = 1;
    oyuncu.sonGunlukOdul = null;
    await oyuncu.save();

    ctx.reply('🔄 TÜM İLERLEMEN SİLİNDİ!\nArtık sıfırdan başlayabilirsin. Tarafını seçmek için: /start yaz.');
});

// KLAN SEÇİMİ
const klanSec = async (ctx, klanAdi) => {
    const oyuncu = await oyuncuGetir(ctx);
    if (oyuncu.klan) return ctx.reply('Zaten bir klanın var! Değiştirmek için: /sifirla');

    oyuncu.klan = klanAdi;
    oyuncu.altin += 100;
    await oyuncu.save();
    
    ctx.deleteMessage();
    ctx.reply(`Tebrikler! Artık ${klanAdi} Klanı üyesisin. 🎁 +100 Altın!\nArena butonuna basarak siteyi açabilirsin.`,
        Markup.inlineKeyboard([
            [Markup.button.webApp('🌍 ARENAYI AÇ', 'https://klan-oyunu.onrender.com')]
        ])
    );
};
bot.action('sec_ates', (ctx) => klanSec(ctx, 'Ateş'));
bot.action('sec_su', (ctx) => klanSec(ctx, 'Su'));
bot.action('sec_toprak', (ctx) => klanSec(ctx, 'Toprak'));

// DİĞER KOMUTLAR
bot.command('savas', async (ctx) => {
    const oyuncu = await oyuncuGetir(ctx);
    if (!oyuncu.klan) return ctx.reply('Önce klan seç: /start');
    
    const kazanc = Math.floor(Math.random() * 50) + 10;
    oyuncu.altin += kazanc;
    await oyuncu.save();
    ctx.reply(`⚔️ Düşmanı yendin! 💰 +${kazanc} Altın`);
});

bot.action('savas_yap', (ctx) => ctx.reply('Savaş başlatılıyor... /savas yazarak devam et.'));

bot.command('gunluk', async (ctx) => { ctx.reply('🎁 Günlük ödül: +50 Altın!'); });
bot.command('profil', async (ctx) => { 
    const o = await oyuncuGetir(ctx); 
    ctx.reply(`👤 ${o.isim}\n🛡️ Klan: ${o.klan || 'Yok'}\n💰 Altın: ${o.altin}`); 
});
bot.command('site', (ctx) => {
    ctx.reply('Arenayı açmak için tıkla:', Markup.inlineKeyboard([
        [Markup.button.webApp('🌍 ARENA GİRİŞ', 'https://klan-oyunu.onrender.com')]
    ]));
});

// Botu Başlat
bot.launch();
console.log('🤖 Bot ve Web Sitesi Aktif!');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));