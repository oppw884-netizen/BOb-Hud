const { Client, GatewayIntentBits, ActivityType } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // จำเป็นถ้าต้องการนับจำนวนคนในเซิร์ฟเวอร์
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`บอทออนแล้ว: ${client.user.tag}`);

    let index = 0;

    // ฟังก์ชันสำหรับอัปเดตสถานะ
    const updateStatus = () => {
        // นับจำนวนสมาชิกทั้งหมดในทุกเซิร์ฟเวอร์ที่บอทอยู่
        const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);

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

        // ตั้งค่าสถานะ Streaming
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

    // เรียกใช้งานทันที 1 ครั้งตอนบอทเปิด
    updateStatus();

    // ตั้งเวลาให้เปลี่ยนข้อความทุกๆ 8 วินาที (8000 มิลลิวินาที)
    setInterval(updateStatus, 8000);
});

client.login('DISCORD_TOKEN');
