const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');

// กำหนด Intents ที่จำเป็น
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// แก้เป็น ID ห้องเสียงของคุณ (ใส่เป็นสตริงหรือตัวเลขก็ได้)
const VOICE_CHANNEL_ID = '1567187288323268752';

client.once('ready', async () => {
    console.log(`บอทออนแล้วไปสัส ${client.user.tag}`);

    try {
        // ค้นหาและดึงข้อมูลห้องเสียง
        const channel = await client.channels.fetch(VOICE_CHANNEL_ID);

        // ตรวจสอบว่าเป็น Voice Channel หรือไม่
        if (channel && channel.isVoiceBased()) {
            // เชื่อมต่อเข้าห้องเสียง
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });
            console.log(`บอทเข้าห้องเสียง: ${channel.name}`);
        } else {
            console.log("ไม่พบ Voice Channel ตาม ID ที่ระบุ หรือไม่ใช่ห้องเสียง");
        }
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการเข้าห้องเสียง:", error);
    }
});

// ล็อกอินด้วย Token ของคุณ
client.login('DISCORD_TOKEN');
