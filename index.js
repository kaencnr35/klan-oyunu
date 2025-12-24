const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const http = require('http'); // Render için gerekli sunucu modülü
require('dotenv').config();

// --- 1. VERİTABANI BAĞLANTISI ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Veritabanına (MongoDB) bağlanıldı!'))
    .catch(err => console.log('❌ Veritabanı hatası:', err));

// Oyuncu Şeması
const OyuncuSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    isim: String,
    klan: { type: String, default: null },
    seviye: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    altin: { type: Number, default: 0 },
    kayitTarihi: { type: Date, default: Date.now }
});

const Oyuncu = mongoose.model('Oyuncu', OyuncuSchema);

// --- 2. BOT KURULUMU ---
const bot = new Telegraf(process.env.BOT_TOKEN);

// Yardımcı Fonksiyon
async function oyuncuGetir(ctx) {
    const id = ctx.from.id;
    let oyuncu = await Oyuncu.findOne({ telegramId: id });
    
    if (!oyuncu) {
        oyuncu = new Oyuncu({
            telegramId: id,
            isim: ctx.from.first_name
        });
        await oyuncu.save();
        console.log(`Yeni oyuncu kaydedildi: ${ctx.from.first_name}`);
    }
    return oyuncu;
}

// --- BAŞLANGIÇ ---
bot.start(async (ctx) => {
    const oyuncu = await oyuncuGetir(ctx);

    if (oyuncu.klan) {
        ctx.reply(`Hoş geldin ${oyuncu.isim}! Zaten ${oyuncu.klan} klanındasın. Savaşmak için /savas yaz.`);
    } else {
        ctx.reply(
            `Hoş geldin ${oyuncu.isim}! ⚔️\nHenüz bir klanın yok. Tarafını seç:`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🔥 Ateş', 'sec_ates'), Markup.button.callback('🌊 Su', 'sec_su')],
                [Markup.button.callback('⛰️ Toprak', 'sec_toprak')]
            ])
        );
    }
});

// --- KLAN SEÇİMİ ---
const klanSec = async (ctx, klanAdi) => {
    const oyuncu = await oyuncuGetir(ctx);
    
    if (oyuncu.klan) {
        return ctx.reply('Zaten bir klanın var! Taraf değiştiremezsin.');
    }

    oyuncu.klan = klanAdi;
    oyuncu.altin += 50;
    await oyuncu.save();
    
    ctx.deleteMessage();
    ctx.reply(`Tebrikler! Artık ${klanAdi} Klanı üyesisin. \n🎁 Hoş geldin hediyesi: 50 Altın hesabına eklendi!\nSavaşmak için: /savas`);
};

bot.action('sec_ates', (ctx) => klanSec(ctx, 'Ateş'));
bot.action('sec_su', (ctx) => klanSec(ctx, 'Su'));
bot.action('sec_toprak', (ctx) => klanSec(ctx, 'Toprak'));

// --- SAVAŞ SİSTEMİ ---
bot.command('savas', async (ctx) => {
    const oyuncu = await oyuncuGetir(ctx);

    if (!oyuncu.klan) {
        return ctx.reply('Önce bir klana katılmalısın! /start yaz.');
    }

    const sans = Math.random();
    if (sans > 0.4) {
        const kazanc = Math.floor(Math.random() * 40) + 10;
        const xp = Math.floor(Math.random() * 15) + 5;
        
        oyuncu.altin += kazanc;
        oyuncu.xp += xp;
        await oyuncu.save();
        
        ctx.reply(`⚔️ ZAFER! Düşmanı yendin.\n💰 +${kazanc} Altın\n✨ +${xp} XP\n(Toplam Altın: ${oyuncu.altin})`);
    } else {
        ctx.reply('💀 YENİLGİ! Düşman çok güçlüydü, kaçtın.');
    }
});

// --- PROFİL ---
bot.command('profil', async (ctx) => {
    const oyuncu = await oyuncuGetir(ctx);
    ctx.reply(
        `👤 **SAVAŞÇI PROFİLİ**\n` +
        `-------------------\n` +
        `🏷️ İsim: ${oyuncu.isim}\n` +
        `🛡️ Klan: ${oyuncu.klan || 'Yok'}\n` +
        `💰 Altın: ${oyuncu.altin}\n` +
        `✨ XP: ${oyuncu.xp}\n` +
        `🏅 Seviye: ${oyuncu.seviye}`
    );
});

// --- 3. RENDER İÇİN SAHTE SUNUCU VE BAŞLATMA ---
// Botu başlat
bot.launch();
console.log('🤖 Veritabanlı Bot Başlatıldı!');

// Render'ın botu kapatmaması için sahte bir web sunucusu açıyoruz
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Klan Savaslari Botu Aktif!');
});

// Render'ın verdiği portu dinle, yoksa 3000'i kullan
const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`🌍 Server ${port} portunda çalışıyor (Render için hazır)`);
});

// Hata yönetimi
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));