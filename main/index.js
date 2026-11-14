require('dotenv').config();

const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, Events } = require('discord.js');
const registerRoblox = require('./roblox');
const registerVoice = require('./Join_Voice');

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

// รายการข้อความที่จะให้สลับวนไปเรื่อยๆ (แก้ไข/เพิ่มได้ตามใจชอบ)
const statuses = [
    'พ่องมุงตาย',
    'ไอ้เวรเอ๊ย',
    'สัสเอ๊ย',
    'แม่งเอ๊ย',
    'มึงจะบ้าหรอ',
    'โคตรปั่น',
    'ไอ้บ้าเอ๊ย',
    'ชีวิตกู',
    'อะไรวะเนี่ย',
    'ฉิบหายแล้ว',
    'มึงเอาจริงดิ',
    'ไอ้ห่าเอ๊ย',
    'บ้าบอคอแตก',
    'กูละปวดหัว',
    'เหี้ยอะไรเนี่ย',
];

// Events.ClientReady ใช้ได้ทั้ง discord.js เวอร์ชันเก่าและใหม่ ('ready' / 'clientReady')
client.once(Events.ClientReady, () => {
    console.log(`บอทออนแล้ว: ${client.user.tag}`);

    let index = 0;

    const updateStatus = () => {
        client.user.setPresence({
            activities: [{
                name: statuses[index],
                type: ActivityType.Streaming,
                url: 'https://www.youtube.com/@HIHi-s2j4q' // ต้องเป็นลิงก์ Twitch หรือ YouTube เพื่อให้ขึ้นจุดสีม่วง
            }],
            status: 'online'
        });

        // เลื่อนไปข้อความถัดไป (ถ้าถึงตัวสุดท้ายจะวนกลับไปตัวแรก)
        index = (index + 1) % statuses.length;
    };

    updateStatus();
    // Discord จำกัดการเปลี่ยน presence (ประมาณ 5 ครั้ง/20 วินาที) จึงตั้งไว้ 15 วินาทีให้ปลอดภัย
    setInterval(updateStatus, 15000);
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

client.on(Events.Error, (error) => console.error('Discord client error:', error));
process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));

client.login(token);
