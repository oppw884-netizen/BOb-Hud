const { Client, GatewayIntentBits } = require('discord.js');
const translate = require('@iamtraction/google-translate');

// ตั้งค่า Intent ของบอท (จำเป็นต้องเปิด Message Content ใน Discord Developer Portal ด้วยนะไอ้สัส)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PREFIX = '!';

client.once('ready', () => {
    console.log(`✅ Login สำเร็จ: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // คำสั่ง !translate <ข้อความ>
    if (command === 'translate') {
        const textToTranslate = args.join(' ');
        
        if (!textToTranslate) {
            return message.reply('```❌ กรุณาระบุข้อความที่ต้องการแปลด้วย! (เช่น !translate Hello)```');
        }

        try {
            // แปลข้อความเป้าหมายเป็นภาษาไทย ('th')
            const res = await translate(textToTranslate, { to: 'th' });
            await message.channel.send(`Translated Message: ${res.text}`);
        } catch (error) {
            console.error(error);
            await message.reply('```❌ เกิดข้อผิดพลาดในการแปลภาษา```');
        }
    }
});

// ใส่ Token บอทของคุณตรงนี้
client.login('YOUR_DISCORD_TOKEN');
