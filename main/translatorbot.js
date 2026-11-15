const translate = require('@iamtraction/google-translate');

const PREFIX = '!';

module.exports = function registerTranslatorBot(client) {
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
                // แปลข้อความเป็นภาษาไทย ('th')
                const res = await translate(textToTranslate, { to: 'th' });
                await message.channel.send(`Translated Message: ${res.text}`);
            } catch (error) {
                console.error(error);
                await message.reply('```❌ เกิดข้อผิดพลาดในการแปลภาษา```');
            }
        }
    });

    console.log('🌐 โหลดโมดูล Translator สำเร็จ!');
};
