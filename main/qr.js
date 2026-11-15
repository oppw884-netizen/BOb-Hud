const QRCode = require('qrcode');
const { AttachmentBuilder, EmbedBuilder, Events } = require('discord.js');

const PREFIX = '!';

module.exports = function registerQr(client) {
    client.on(Events.MessageCreate, async (message) => {
        if (message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        if (command !== 'qr') return;

        const url = args.join(' ');
        if (!url) {
            return message.reply('```❌ กรุณาระบุลิงก์หรือข้อความ (เช่น !qr https://example.com)```');
        }

        try {
            // สร้าง QR code เป็นรูป PNG ใน memory
            const buffer = await QRCode.toBuffer(url, {
                scale: 10,   // เทียบเท่า box_size=10
                margin: 5,   // เทียบเท่า border=5
                color: { dark: '#000000', light: '#FFFFFF' }
            });

            const attachment = new AttachmentBuilder(buffer, { name: 'qrcode.png' });

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('QR Code')
                .setDescription(`Generated QR code for the URL: ${url}`)
                .setImage('attachment://qrcode.png');

            await message.channel.send({ embeds: [embed], files: [attachment] });
        } catch (error) {
            console.error('คำสั่ง !qr ผิดพลาด:', error);
            await message.reply('```❌ สร้าง QR code ไม่สำเร็จ (ข้อความอาจยาวเกินไป)```');
        }
    });

    console.log('🔳 โหลดโมดูล QR สำเร็จ!');
};
