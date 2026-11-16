require('dotenv').config();

const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, Events } = require('discord.js');
const registerRoblox = require('./roblox');
const registerVoice = require('./Join_Voice');
const registerAuto_QUEST = require('./Auto_QUEST');
const registerCopy_Emoji = require('./Copy_Emoji');
const registerxo = require('./xo');
const registerannounce = require('./announce');
const translatorModule = require('./translatorbot');
const Musicbot = require('./Musicbot/main.js');
const registerHelp = require('./help/main.js');

const registertranslatorbot =
    typeof translatorModule === 'function'
        ? translatorModule
        : translatorModule.default ||
          translatorModule.registerTranslatorBot ||
          translatorModule.registertranslatorbot ||
          Object.values(translatorModule).find((v) => typeof v === 'function');
const registerQr = require('./qr');

const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('ไม่พบ DISCORD_TOKEN — คัดลอก .env.example เป็น .env แล้วใส่โทเคนบอทก่อน');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // จำเป็นถ้าต้องการนับจำนวนคนในเซิร์ฟเวอร์ (ต้องเปิด Intent นี้ใน Developer Portal ด้วย)
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ข้อความคำคม/สโลแกนที่จะสลับโชว์ (แก้ไข/เพิ่มได้ตามใจชอบ)
const TAGLINES = [
    'ความเป็นเราคือสั่งที่ได้ที่สุด',
];

// สำคัญ: ต้องตั้ง presence ข้างใน ClientReady เท่านั้น เพราะ client.user เป็น null
// จนกว่าบอทจะ login และ "ready" เสร็จก่อน ถ้าเรียกนอกนี้จะพังด้วย
// "Cannot read properties of null (reading 'setPresence')"
client.once(Events.ClientReady, () => {
    console.log(`บอทออนแล้ว: ${client.user.tag}`);

    let showingStats = true;
    let taglineIndex = 0;

    // สลับระหว่างสถิติเรียลไทม์ (จำนวนเซิร์ฟเวอร์/ผู้ใช้) กับข้อความคำคม
    const updatePresence = () => {
        let name;

        if (showingStats) {
            const totalServers = client.guilds.cache.size;
            const totalUsers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
            name = `[ 🌐 Servers: ${totalServers.toLocaleString('en-US')} | 👤 User: ${totalUsers.toLocaleString('en-US')} ]`;
        } else {
            name = TAGLINES[taglineIndex];
            taglineIndex = (taglineIndex + 1) % TAGLINES.length;
        }

        client.user.setPresence({
            activities: [{ name, type: ActivityType.Watching }], // "กำลังดู ..."
            status: 'Do Not Disturb'
        });

        showingStats = !showingStats;
    };

    updatePresence();
    // Discord จำกัดการเปลี่ยน presence (ประมาณ 5 ครั้ง/20 วินาที) จึงตั้งไว้ 15 วินาทีให้ปลอดภัย
    setInterval(updatePresence, 15000);
});

// ระบบคำสั่งเช็กสถานะ (!ping หรือ !status)
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    if (message.content === '!ping' || message.content === '!status') {
        try {
            const sent = await message.reply('กำลังตรวจสอบสถานะระบบ...');

            // ความหน่วงแบบ Round-trip
            const latency = sent.createdTimestamp - message.createdTimestamp;
            const apiPing = client.ws.ping;

            // เวลาที่บอทเปิดทำงาน
            const totalSeconds = Math.floor(client.uptime / 1000);
            const days = Math.floor(totalSeconds / 86400);
            const hours = Math.floor((totalSeconds % 86400) / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            const uptimeString = `${days} วัน ${hours} ชม. ${minutes} นาที ${seconds} วินาที`;

            const totalMembers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
            const totalServers = client.guilds.cache.size;

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🤖 สถานะระบบ BOb-Hud Bot')
                .addFields(
                    { name: '🏓 ความหน่วงข้อความ (Latency)', value: `${latency}ms`, inline: true },
                    { name: '🌐 API WebSocket (Ping)', value: `${apiPing}ms`, inline: true },
                    { name: '⏱️ ระยะเวลาเปิดทำงาน (Uptime)', value: uptimeString, inline: false },
                    { name: '👥 จำนวนสมาชิกทั้งหมด', value: `${totalMembers} คน`, inline: true },
                    { name: '🏠 จำนวนเซิร์ฟเวอร์', value: `${totalServers} เซิร์ฟเวอร์`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `ร้องขอโดย ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });

            await sent.edit({ content: null, embeds: [embed] });
        } catch (error) {
            console.error('คำสั่ง !ping/!status ผิดพลาด:', error);
        }
    }
});

// ฟีเจอร์เสริม (ใช้ client ตัวเดียวกัน ไม่ต้อง login ซ้ำ)
registerRoblox(client);
registerVoice(client);
registerHelp(client);
registerAuto_QUEST(client);
registerCopy_Emoji(client);
registerxo(client);
registerannounce(client);
registertranslatorbot(client);
registerQr(client);
Musicbot(client);
registerHelp(client);
client.on(Events.Error, (error) => console.error('Discord client error:', error));
process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));

client.login(token);
