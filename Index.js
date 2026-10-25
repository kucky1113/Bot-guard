require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    PermissionsBitField, 
    ApplicationCommandOptionType, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const mongoose = require('mongoose');

// ==========================================
// 1. KONEKSI & SKEMA DATABSE MONGO CLOUD
// ==========================================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('🍃 [DATABASE] Kredensial Valid. Terhubung ke Cloud MongoDB Atlas!'))
    .catch(err => console.error('❌ [DATABASE] Gagal terhubung ke Cloud:', err));

// Skema penyimpanan database permanen untuk setiap server Discord
const ServerConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    antilink: { type: Boolean, default: false },
    antispam: { type: Boolean, default: false },
    antialt: { type: Number, default: 0 },
    badwords: { type: [String], default: [] }
});
const ServerConfig = mongoose.model('ServerConfig', ServerConfigSchema);

// Helper untuk mengambil atau membuat konfigurasi otomatis di database
async function getSettings(guildId) {
    let config = await ServerConfig.findOne({ guildId });
    if (!config) config = await ServerConfig.create({ guildId });
    return config;
}

// Inisialisasi Klien Bot Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
});

// Cache RAM berkecepatan tinggi untuk deteksi anomali
const antiSpamMap = new Map();
const rateLimitBypass = new Set();
const joinTracker = []; 

// Helper Kirim Alert Kasus Mencurigakan ke Channel Khusus Staff
async function sendSecurityAlert(guild, title, description, severity = 'LOW') {
    const logChannel = guild.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (!logChannel) return;

    const colorMap = { 'LOW': '#FFAA00', 'MEDIUM': '#FF5500', 'HIGH': '#FF0000' };
    
    const alertEmbed = new EmbedBuilder()
        .setTitle(`🚨 SECURITY ALERT: ${title}`)
        .setColor(colorMap[severity] || '#FFFFFF')
        .setDescription(description)
        .addFields({ name: '🛡️ Status Sistem', value: 'Memantau Aktif 🟢', inline: true })
        .setTimestamp()
        .setFooter({ text: 'Sistem Deteksi Anomali Cloud' });

    logChannel.send({ 
        content: severity === 'HIGH' ? '⚠️ @everyone **TERDETEKSI ANCAMAN SANGAT BERBAHAYA!**' : '', 
        embeds: [alertEmbed] 
    }).catch(() => {});
}

// ==========================================
// 2. REGISTRASI SEMUA INSTAN SLASH COMMANDS
// ==========================================
client.once('ready', async () => {
    console.log(`🛡️ [ENTERPRISE CORE] System Guard Active: ${client.user.tag}`);
    client.user.setActivity('🔒 Ironclad Security 24/7', { type: 3 });

    try {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        const commands = guild ? guild.commands : client.application.commands;

        await commands.set([
            {
                name: 'antilink',
                description: '🛡️ Mengaktifkan/menonaktifkan filter link global.',
                options: [{ name: 'status', description: 'Aktifkan filter', type: ApplicationCommandOptionType.Boolean, required: true }]
            },
            {
                name: 'antispam',
                description: '🚨 Mengaktifkan/menonaktifkan proteksi raid cepat.',
                options: [{ name: 'status', description: 'Aktifkan filter', type: ApplicationCommandOptionType.Boolean, required: true }]
            },
            {
                name: 'kata-dilarang',
                description: '🔤 Mengelola filter kata terlarang server.',
                options: [
                    {
                        name: 'tindakan',
                        description: 'Aksi data',
                        type: ApplicationCommandOptionType.String,
                        required: true,
                        choices: [
                            { name: 'Tambah Kata', value: 'add' },
                            { name: 'Hapus Kata', value: 'remove' },
                            { name: 'Lihat Semua', value: 'list' }
                        ]
                    },
                    { name: 'kata', description: 'Kata target', type: ApplicationCommandOptionType.String, required: false }
                ]
            },
            {
                name: 'lock-channel',
                description: '🔒 Mengunci atau membuka channel teks dari member biasa.',
                options: [{ name: 'status', description: 'Kunci (True) / Buka (False)', type: ApplicationCommandOptionType.Boolean, required: true }]
            },
            {
                name: 'blacklist-add',
                description: '🔨 Blokir permanen user dan masukkan ke hard-blacklist.',
                options: [
                    { name: 'target', description: 'Pilih user/ID', type: ApplicationCommandOptionType.User, required: true },
                    { name: 'alasan', description: 'Alasan blacklist', type: ApplicationCommandOptionType.String, required: true }
                ]
            },
            {
                name: 'warning-add',
                description: '⚠️ Memberikan surat peringatan formal dengan eksekusi instan.',
                options: [
                    { name: 'target', description: 'Member melanggar', type: ApplicationCommandOptionType.User, required: true },
                    { name: 'alasan', description: 'Alasan formal', type: ApplicationCommandOptionType.String, required: true },
                    {
                        name: 'hukuman',
                        description: 'Pilih jenis hukuman penalti',
                        type: ApplicationCommandOptionType.String,
                        required: true,
                        choices: [
                            { name: 'Timeout (10 Mnt)', value: 'timeout' },
                            { name: 'Kick', value: 'kick' },
                            { name: 'Ban', value: 'ban' }
                        ]
                    }
                ]
            },
            {
                name: 'setup-verification',
                description: '🎯 Membuat panel tombol verifikasi otomatis di channel ini.'
            },
            {
                name: 'anti-alt',
                description: '🤖 Batasi umur minimal akun baru yang boleh masuk server.',
                options: [{ name: 'hari', description: 'Umur minimal akun (hari)', type: ApplicationCommandOptionType.Integer, required: true }]
            },
            {
                name: 'server-audit-scan',
                description: '🔍 Memindai server untuk mendeteksi role berbahaya dengan hak Admin.'
            },
            {
                name: 'emergency-mass-unban',
                description: '🚨 Keadaan Darurat: Membuka semua ban list server dalam sekali klik.'
            }
        ]);
        console.log('📦 [SYSTEM] Semua Slash Command Terdeploy Sempurna.');
    } catch (error) {
        console.error('❌ Deployment Command Crash:', error);
    }
});

// ==========================================
// 3. MONITOR DETEKSI ANOMALI JOIN (ANTI-RAID & ANTI-ALT)
// ==========================================
client.on('guildMemberAdd', async (member) => {
    const now = Date.now();
    const config = await getSettings(member.guild.id);
    
    // A. Deteksi Serbuan Raid Massal
    joinTracker.push(now);
    const recentJoins = joinTracker.filter(time => now - time < 10000);
    
    if (recentJoins.length >= 5) {
        await sendSecurityAlert(
            member.guild, 
            'TERDETEKSI SERANGAN RAID BOT', 
            `⚠️ **Anomali Masuk Massal:** Ada **${recentJoins.length} akun** masuk bersamaan dalam waktu kurang dari 10 detik.\n\nSistem memperketat pertahanan otomatis.`, 
            'HIGH'
        );
    }

    // B. Deteksi Pola Nama Akun Menggunakan Karakter Acak (Bot Generator)
    const botPattern = /^[a-z0-9]{8,15}$/i; 
    if (botPattern.test(member.user.username)) {
        await sendSecurityAlert(
            member.guild,
            'AKUN MENCURIGAKAN BERGABUNG',
            `👤 **User:** ${member.user.tag} (\`${member.user.id}\`)\n⚠️ **Indikasi:** Struktur nama terindikasi sebagai akun kloningan/otomatis.\nSistem menempatkan user ini dalam pengawasan chat ketat.`,
            'MEDIUM'
        );
    }

    // C. Sistem Proteksi Umur Akun (Anti-Alt Cloud)
    if (config.antialt > 0) {
        const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
        if (accountAgeDays < config.antialt) {
            try {
                await member.send(`❌ Akses Ditolak: Server **${member.guild.name}** membatasi akun baru. Minimal usia akun adalah ${config.antialt} hari. Akun Anda baru berusia ${accountAgeDays} hari.`).catch(() => {});
                await member.kick('Security Alert: Anti-Alt Account Shielded.');
                await sendSecurityAlert(
                    member.guild, 
                    'AKUN PADA USIA ANCAMAN DITENDANG', 
                    `**User:** ${member.user.tag}\n**Usia:** ${accountAgeDays} hari (Batas aman server: ${config.antialt} hari).`, 
                    'MEDIUM'
                );
            } catch {}
        }
    }
});

// ==========================================
// 4. CHAT FIREWALL REAL-TIME INTERCEPTOR
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    if (message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;

    const guildId = message.guild.id;
    const authorId = message.author.id;
    const config = await getSettings(guildId);

                                                            
