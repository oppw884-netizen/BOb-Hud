const { Client, GatewayIntentBits, ActivityType } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`บอทออนแล้ว: ${client.user.tag}`);

    // ตั้งค่าสถานะ Streaming ใน index.js
    client.user.setPresence({
        activities: [{
            name: 'พ่องมุงตุย', // ข้อความสตรีม
            type: ActivityType.Streaming,
            url: 'https://dc.gg/higarden' // ลิงก์ Twitch
        }],
        status: 'online'
    });
});

// ล็อกอินด้วย Token ของคุณ
client.login('DISCORD_TOKEN');
