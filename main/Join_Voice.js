const { Events } = require('discord.js');
const {
    joinVoiceChannel,
    entersState,
    VoiceConnectionStatus,
} = require('@discordjs/voice');

// ID ห้องเสียง — ตั้งใน .env เป็น VOICE_CHANNEL_ID (ถ้าไม่ตั้งจะใช้ค่าเดิมด้านล่าง)
const DEFAULT_VOICE_CHANNEL_ID = '1567187288323268752';

module.exports = function registerVoice(client) {
    const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID || DEFAULT_VOICE_CHANNEL_ID;

    client.once(Events.ClientReady, async () => {
        try {
            const channel = await client.channels.fetch(VOICE_CHANNEL_ID);

            if (!channel || !channel.isVoiceBased()) {
                console.log('ไม่พบ Voice Channel ตาม ID ที่ระบุ หรือไม่ใช่ห้องเสียง');
                return;
            }

            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: true,
            });

            console.log(`บอทเข้าห้องเสียง: ${channel.name}`);

            // ถ้าหลุดจากห้อง (เช่น โดนย้าย/เน็ตหลุด) ให้ลองต่อใหม่ ถ้าไม่ได้ค่อยทำลาย connection
            connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                } catch {
                    connection.destroy();
                    console.log('หลุดจากห้องเสียงและเชื่อมต่อใหม่ไม่ได้');
                }
            });
        } catch (error) {
            console.error('เกิดข้อผิดพลาดในการเข้าห้องเสียง:', error);
        }
    });
};
