const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    PermissionFlagsBits 
} = require('discord.js');

// ใส่ไอดีเซิร์ฟเวอร์ของคุณที่เป็นตัวเลข (ห้ามใส่เป็นตัวหนังสือภาษาไทยเด็ดขาด)
const guildid = "1567187286569783346"; 

module.exports = (client) => {
    console.log("📢 โหลดโมดูล Announce สำเร็จ!");

    // เปลี่ยนจาก 'ready' เป็น 'clientReady' ตามที่ Discord.js v14 แนะนำ
    client.once('clientReady', async () => {
        const data = new SlashCommandBuilder()
            .setName('announce')
            .setDescription('สร้างประกาศ | (admin only)');

        try {
            const guild = client.guilds.cache.get(guildid) || await client.guilds.fetch(guildid);
            if (guild) {
                await guild.commands.create(data);
                console.log('✅ ลงทะเบียนคำสั่ง /announce สำเร็จ!');
            }
        } catch (error) {
            console.error('❌ เกิดข้อผิดพลาดในการลงทะเบียนคำสั่ง /announce:', error);
        }
    });

    // จัดการการพิมพ์คำสั่ง /announce
    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === 'announce') {
            // เช็คยศแอดมิน
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: 'มึงไม่มีสิทธิ์ใช้ครับไอ้โง่', ephemeral: true });
            }

            // สร้าง Modal
            const modal = new ModalBuilder()
                .setCustomId('announce_modal')
                .setTitle('สร้างประกาศ');

            const titleInput = new TextInputBuilder()
                .setCustomId('em_title')
                .setLabel('ชื่อหัวข้อ')
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            const descInput = new TextInputBuilder()
                .setCustomId('em_description')
                .setLabel('รายละเอียดข้อความ')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false);

            const imageInput = new TextInputBuilder()
                .setCustomId('em_image')
                .setLabel('ลิ้งรูปภาพ')
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            const colorInput = new TextInputBuilder()
                .setCustomId('em_color')
                .setLabel('สีของ embed (hex code)')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(6)
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(descInput),
                new ActionRowBuilder().addComponents(imageInput),
                new ActionRowBuilder().addComponents(colorInput)
            );

            await interaction.showModal(modal);
        }
    });

    // จัดการตอนกดยืนยัน Modal
    client.on('interactionCreate', async interaction => {
        if (!interaction.isModalSubmit()) return;

        if (interaction.customId === 'announce_modal') {
            const title = interaction.fields.getTextInputValue('em_title');
            const description = interaction.fields.getTextInputValue('em_description');
            const image = interaction.fields.getTextInputValue('em_image');
            const colorVal = interaction.fields.getTextInputValue('em_color');

            // แปลง Hex Code เป็น Integer สำหรับ Embed Color (ถ้าไม่ได้ใส่ให้เป็นค่าเริ่มต้น)
            let color = colorVal ? parseInt(colorVal, 16) : 0x0099ff;

            // ฟังก์ชันเช็ค URL
            const isValidUrl = (url) => {
                try {
                    new URL(url);
                    return true;
                } catch (_) {
                    return false;
                }
            };

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTimestamp()
                .setFooter({ text: 'ประกาศจากแอดมิน' });

            if (title) embed.setTitle(title);
            if (description) embed.setDescription(description);

            if (image && isValidUrl(image)) {
                embed.setImage(image);
            }

            // ส่ง @everyone และ embed ไปที่ช่องแชท
            await interaction.channel.send({ content: '@everyone', embeds: [embed] });
            await interaction.reply({ content: 'สร้างประกาศสำเร็จ', ephemeral: true });
        }
    });
};
