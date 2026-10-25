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
const { QuickDB } = require('quick.db');

const db = new QuickDB();
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
});

// Cache RAM berkecepatan tinggi
const antiSpamMap = new Map();
const rateLimitBypass = new Set();

// Helper Kirim Log Rahasia Staff
async function sendSecurityLog(guild, embed) {
    const logChannel = guild.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (logChannel) logChannel.send({ embeds: [embed] }).catch(() => {});
}

// ==========================================
// 1. REGISTRASI SEMUA INSTAN SLASH COMMANDS
// ==========================================
client.once('ready', async () => {
    console.log(`🛡️ [ENTERPRISE CORE] System Guard Active: ${client.user.tag}`);
    client.user.setActivity('🔒 Ironclad Security 24/7', { type: 3 });

    try {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        const commands = guild ? guild.commands : client.application.commands;

        await commands.set([
            // Command Sebelumnya (Optimal & Sinkron)
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
                description: '🔤 Mengelola filter kata terlarang.',
                options: [
                    {
                        name: 'tindakan',
                        description: 'Aksi database',
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
            // --- FITUR BARU PENUNJANG PROFESIONAL ---
            {
                name: 'setup-verification',
                description: '🎯 Membuat panel tombol verifikasi otomatis di channel ini (Mencegah Bot Raid).'
            },
            {
                name: 'anti-alt',
                description: '🤖 Batasi umur minimal akun baru yang boleh masuk server (Menangkal Akun Kloning Scammer).',
                options: [{ name: 'hari', description: 'Umur minimal akun (dalam hari, contoh: 7)', type: ApplicationCommandOptionType.Integer, required: true }]
            },
            {
                name: 'server-audit-scan',
                description: '🔍 Memindai server untuk mendeteksi role berbahaya dengan izin admin berlebih.'
            },
            {
                name: 'emergency-mass-unban',
                description: '🚨 Keadaan Darurat: Membuka semua ban list server dalam sekali klik (Jika salah ban massal).'
            }
        ]);
        console.log('📦 [SYSTEM] All Elite Commands Deployed Correctly.');
    } catch (error) {
        console.error('❌ Deployment Command Crash:', error);
    }
});

// ==========================================
// 2. DETEKSI OTOMATIS MEMBER BARU (ANTI-ALT ENGINE)
// ==========================================
client.on('guildMemberAdd', async (member) => {
    const minAgeDays = await db.get(`antialt_${member.guild.id}`) || 0;
    if (minAgeDays === 0) return;

    const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));

    if (accountAgeDays < minAgeDays) {
        try {
            await member.send(`❌ Akun Anda ditolak masuk ke **${member.guild.name}**. Server ini menerapkan sistem keamanan ketat anti akun kloning (Akun Anda baru berumur ${accountAgeDays} hari, minimal wajib ${minAgeDays} hari).`).catch(() => {});
            await member.kick('Security Alert: Anti-Alt Account Safeguard Triggered.');

            const alertEmbed = new EmbedBuilder()
                .setTitle('🚨 Anti-Alt Account Intercepted')
                .setColor('#FFCC00')
                .setDescription(`**User Intercepted:** ${member.user.tag} (\`${member.user.id}\`)\n**Umur Akun:** ${accountAgeDays} Hari\n**Batas Minimal:** ${minAgeDays} Hari\n**Tindakan:** Otomatis di-KICK demi keselamatan server.`)
                .setTimestamp();
            
            await sendSecurityLog(member.guild, alertEmbed);
        } catch (err) {
            console.error('Gagal memproses anti-alt:', err);
        }
    }
});

// ==========================================
// 3. ENGINE FILTER VALIDASI PESAN UTAMA
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    if (message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;

    const guildId = message.guild.id;
    const authorId = message.author.id;

    // [INTUITIVE ANTI-SPAM INTERCEPTOR]
    const isAntiSpamOn = await db.get(`antispam_${guildId}`);
    if (isAntiSpamOn) {
        const now = Date.now();
        if (!antiSpamMap.has(authorId)) antiSpamMap.set(authorId, []);
        const validLogs = antiSpamMap.get(authorId).filter(time => now - time < 4000);
        validLogs.push(now);
        antiSpamMap.set(authorId, validLogs);

        if (validLogs.length >= 6) {
            if (rateLimitBypass.has(authorId)) return;
            rateLimitBypass.add(authorId);
            await message.delete().catch(() => {});
            
            try {
                await message.member.timeout(15 * 60 * 1000, 'Security Engine: Rapid Spam Mitigated.');
                const logEmbed = new EmbedBuilder()
                    .setTitle('🚨 Automated Anti-Spam Triggered')
                    .setColor('#FF0055')
                    .setDescription(`**User:** ${message.author}\n**Tindakan:** Timeout Otomatis 15 Menit.`)
                    .setTimestamp();
                await sendSecurityLog(message.guild, logEmbed);
            } catch {}
            setTimeout(() => rateLimitBypass.delete(authorId), 10000);
            return;
        }
    }

    // [ANTILINK GLOBAL ENGINE]
    const isAntiLinkOn = await db.get(`antilink_${guildId}`);
    if (isAntiLinkOn && /(https?:\/\/[^\s]+)|(discord\.gg\/[^\s]+)/gi.test(message.content)) {
        await message.delete().catch(() => {});
        return message.channel.send(`⚠️ **Proteksi:** ${message.author}, dilarang membagikan tautan luar!`).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
    }

    // [ANTI TOXIC REGEX SYSTEM]
    const badWords = await db.get(`badwords_${guildId}`) || [];
    if (badWords.length > 0) {
        const normalized = message.content.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '');
        if (badWords.some(w => normalized.split(/\s+/).includes(w) || normalized.includes(w))) {
            await message.delete().catch(() => {});
        }
    }
});

// ==========================================
// 4. INTERACTION & INTERFACE CONTROLLER
// ==========================================
client.on('interactionCreate', async (interaction) => {
    const guildId = interaction.guild?.id;

    // HANDLING VERIFIKASI KLIK TOMBOL (Anti-Bot Panel)
    if (interaction.isButton() && interaction.customId === 'verify_member') {
                  
