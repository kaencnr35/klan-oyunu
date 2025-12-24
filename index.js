const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const http = require('http');
require('dotenv').config();

// --- 1. VERİTABANI BAĞLANTISI ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Veritabanına (MongoDB) bağlanıldı!'))
    .catch(err => console.log('❌ Veritabanı hatası:', err));

// Oyuncu Şeması (YENİ: sonGunlukOdul eklendi)
const OyuncuSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    isim: String,
    klan: { type: String, default: null },
    seviye: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    altin: { type: Number, default: 0 },
    kayitTarihi: { type: Date, default: Date.now },
    sonGunlukOdul: { type: Date, default: null } // Günlük ödül takibi için
});

const Oyuncu = mongoose.model('Oyuncu', OyuncuSchema);

// --- 2. BOT KURULUMU ---
const bot = new Telegraf(process.env.BOT_TOKEN);

// Yardımcı Fonksiyon: Oyuncuyu Bul
async function oyuncuGetir(ctx) {
    const id = ctx.from.id;
    let oyuncu = await Oyuncu.findOne({ telegramId: id });
    
    if (!oyuncu) {
        oyuncu = new Oyuncu({
            telegramId: id,
            isim: ctx.from.first_name
        });
        await oyuncu.save();
    }
    return oyuncu;
}

// --- RESİM LİNKLERİ (Bunları değiştirebilirsin) ---
const IMG_GIRIS = 'https://wallpapers.com/images/hd/fantasy-warrior-knight-art-4k-jkd9t7y2j3j4j5k6.jpg'; // Giriş resmi
const IMG_ATES = 'https://c4.wallpaperflare.com/wallpaper/521/18/265/fantasy-art-digital-art-dragon-fire-wallpaper-preview.jpg'; // Ateş Klanı
const IMG_SU = 'https://c4.wallpaperflare.com/wallpaper/636/971/457/fantasy-art-digital-art-creature-leviathan-wallpaper-preview.jpg'; // Su Klanı
const IMG_TOPRAK = 'https://c4.wallpaperflare.com/wallpaper/106/579/680/digital-art-fantasy-art-golem-creature-wallpaper-preview.jpg'; // Toprak Klanı
const IMG_SAVAS_WIN = 'https://i.pinimg.com/736x/f6/8d/f3/f68df32420fb2163b2880344d57053e8.jpg'; // Zafer

// --- BAŞLANGIÇ (GÖRSELLİ) ---
bot.start(async (ctx) => {
    const oyuncu = await oyuncuGetir(ctx);

    if (oyuncu.klan) {
        ctx.reply(`Hoş geldin ${oyuncu.isim}! Zaten ${oyuncu.klan} klanındasın. Savaşmak için /savas yaz.`);
    } else {
        // Resimli Mesaj Gönderiyoruz
        ctx.replyWithPhoto(IMG_GIRIS, {
            caption: `Hoş geldin ${oyuncu.isim}! ⚔️\nBurada hayatta kalmak için bir klana ihtiyacın var.\n\nLütfen tarafını seç:`,
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔥 Ateş Klanı', 'sec_ates'), Markup.button.callback('🌊 Su Klanı', 'sec_su')],
                [Markup.button.callback('⛰️ Toprak Klanı', 'sec_toprak')]
            ])
        });
    }
});

// --- KLAN SEÇİMİ (GÖRSELLİ) ---
const klanSec = async (ctx, klanAdi, resimUrl) => {
    const oyuncu = await oyuncuGetir(ctx);
    
    if (oyuncu.klan) return ctx.reply('Zaten bir klanın var!');

    oyuncu.klan = klanAdi;
    oyuncu.altin += 100; // Hoş geldin hediyesi arttı
    await oyuncu.save();
    
    ctx.deleteMessage(); // Eski mesajı sil
    // Yeni Klan Resmini Gönder
    ctx.replyWithPhoto(resimUrl, {
        caption: `Tebrikler! Artık ${klanAdi} Klanı üyesisin.\n🎁 Hoş geldin hediyesi: 100 Altın!\n\nKomutlar:\n⚔️ /savas - Savaş yap\n🎁 /gunluk - Günlük ödülünü al\n🏆 /liderlik - Sıralamayı gör`
    });
};

bot.action('sec_ates', (ctx) => klanSec(ctx, 'Ateş', IMG_ATES));
bot.action('sec_su', (ctx) => klanSec(ctx, 'Su', IMG_SU));
bot.action('sec_toprak', (ctx) => klanSec(ctx, 'Toprak', IMG_TOPRAK));

// --- SAVAŞ SİSTEMİ ---
bot.command('savas', async (ctx) => {
    const oyuncu = await oyuncuGetir(ctx);
    if (!oyuncu.klan) return ctx.reply('Önce klana katıl: /start');

    const sans = Math.random();
    if (sans > 0.4) {
        const kazanc = Math.floor(Math.random() * 50) + 10;
        const xp = Math.floor(Math.random() * 20) + 5;
        
        oyuncu.altin += kazanc;
        oyuncu.xp += xp;
        await oyuncu.save();
        
        // Zaferde bazen resim atalım (her zaman değil, spam olmasın)
        if (Math.random() > 0.7) {
            ctx.replyWithPhoto(IMG_SAVAS_WIN, { caption: `⚔️ MUAZZAM ZAFER!\nCanavarı ezdin geçtin!\n💰 +${kazanc} Altın | ✨ +${xp} XP` });
        } else {
            ctx.reply(`⚔️ Düşmanı yendin!\n💰 +${kazanc} Altın\n✨ +${xp} XP\n(Toplam: ${oyuncu.altin} Altın)`);
        }
    } else {
        ctx.reply('💀 Pusuya düştün ve yaralı kaçtın... (Kazanç yok)');
    }
});

// --- GÜNLÜK ÖDÜL (YENİ) ---
bot.command('gunluk', async (ctx) => {
    const oyuncu = await oyuncuGetir(ctx);
    
    // Zaman kontrolü (24 saat = 86400000 milisaniye)
    const simdi = new Date();
    if (oyuncu.sonGunlukOdul && (simdi - oyuncu.sonGunlukOdul) < 86400000) {
        const kalanSure = 86400000 - (simdi - oyuncu.sonGunlukOdul);
        const kalanSaat = Math.floor(kalanSure / (1000 * 60 * 60));
        const kalanDakika = Math.floor((kalanSure % (1000 * 60 * 60)) / (1000 * 60));
        return ctx.reply(`⏳ Henüz erken! Günlük ödülünü ${kalanSaat} saat ${kalanDakika} dakika sonra alabilirsin.`);
    }

    const odul = 250;
    oyuncu.altin += odul;
    oyuncu.sonGunlukOdul = simdi;
    await oyuncu.save();

    ctx.reply(`🎁 GÜNLÜK ÖDÜL!\nSadakatin için teşekkürler.\nHesabına +${odul} Altın eklendi! 💰`);
});

// --- LİDERLİK TABLOSU (YENİ) ---
bot.command('liderlik', async (ctx) => {
    // En zengin 10 kişiyi bul
    const liderler = await Oyuncu.find().sort({ altin: -1 }).limit(10);
    
    let mesaj = "🏆 **EN ZENGİN SAVAŞÇILAR** 🏆\n\n";
    liderler.forEach((o, i) => {
        let madalya = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🔸';
        mesaj += `${madalya} ${i + 1}. ${o.isim} (${o.klan || 'Gezgin'}) - ${o.altin} 💰\n`;
    });
    
    ctx.reply(mesaj);
});

// --- PROFİL ---
bot.command('profil', async (ctx) => {
    const oyuncu = await oyuncuGetir(ctx);
    ctx.reply(`👤 **${oyuncu.isim}**\n🛡️ Klan: ${oyuncu.klan}\n💰 Altın: ${oyuncu.altin}\n✨ XP: ${oyuncu.xp}`);
});

// --- RENDER SUNUCUSU ---
bot.launch();
console.log('🤖 Gelişmiş Bot Başlatıldı!');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot Calisiyor!');
});
server.listen(process.env.PORT || 3000);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));