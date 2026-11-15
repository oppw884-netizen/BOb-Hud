const { 
    SlashCommandBuilder, 
    REST, 
    Routes, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    AttachmentBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder 
} = require('discord.js');

const AdmZip = require('adm-zip');
const axios = require('axios');
const fs = require('node:fs');
const path = require('node:path');

const Token = process.env.DISCORD_TOKEN || '';
const ClientIds = process.env.CLIENT_ID || process.env.CLIENT_IDS || '';
const AdminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];

module.exports = (client) => {
    console.log("🍀 โหลดโมดูล Copy_Emoji สำเร็จ!");

    client.once('ready', async () => {
        const commands = [
            new SlashCommandBuilder()
                .setName('clear_emoji')
                .setDescription('[ ⛔ คำสั่งล้างอิโมจิทั้งหมด ]')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
                .toJSON(),
            new SlashCommandBuilder()
                .setName('add_emoji')
                .setDescription('[ 🌵 คำสั่งเพิ่มอิโมจิ ]')
                .addAttachmentOption(option =>
                    option.setName('เลือกไฟล์')
                        .setDescription('[ 📂 โปรดอัพโหลดไฟล์นามสกุล .ZIP ]')
                        .setRequired(true)
                )
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
                .toJSON(),
            new SlashCommandBuilder()
                .setName('check_emoji')
                .setDescription('[ 💬 เช็คอิโมจิทั้งหมดในเซิร์ฟเวอร์ ]')
                .toJSON(),
            new SlashCommandBuilder()
                .setName('copy_emoji')
                .setDescription('[ 🍀 ก็อปปี้อิโมจิจากเซิร์ฟ ]')
                .toJSON()
        ];

        const rest = new REST({ version: '10' }).setToken(Token);

        try {
            // ลงทะเบียนแบบ Global เพื่อหลบปัญหา Missing Access (403)
            await rest.put(
                Routes.applicationCommands(ClientIds),
                { body: commands }
            );
            console.log('✅ ลงทะเบียนคำสั่ง Emoji แบบ Global สำเร็จ!');
        } catch (err) {
            console.error('❌ เกิดข้อผิดพลาดในการลงทะเบียนคำสั่ง Emoji:', err);
        }
    });

    client.on('interactionCreate', async interaction => {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'clear_emoji') {
                if (!AdminIds.includes(interaction.user.id)) {
                    return interaction.reply({ content: '```❌ คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้```', ephemeral: true });
                }

                await interaction.deferReply({ ephemeral: true });

                const emojis = interaction.guild.emojis.cache;
                const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('``💬`` การล้างอิโมจิในเซิฟเวอร์')
                    .setTimestamp();

                if (!emojis.size) {
                    embed.setDescription('```❌ ไม่มีอิโมจิในเซิร์ฟเวอร์ตอนนี้!!```');
                    return interaction.editReply({ embeds: [embed] });
                }

                let deleted = 0;
                const failedEmojis = [];

                for (const [, emoji] of emojis) {
                    try {
                        await emoji.delete();
                        deleted++;
                    } catch (err) {
                        failedEmojis.push(emoji.name);
                    }
                }

                embed.setDescription(`\`\`\`🌵 ล้างอิโมจิในเซิฟเวอร์สำเร็จ ${deleted} รายการ\`\`\``);
                if (failedEmojis.length > 0) {
                    embed.addFields({ name: '```⛔ ลบไม่สำเร็จ```', value: failedEmojis.join(', ') });
                }
                await interaction.editReply({ embeds: [embed] });

            } else if (interaction.commandName === 'add_emoji') {
                if (!AdminIds.includes(interaction.user.id)) {
                    return interaction.reply({ content: '```❌ คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้```', ephemeral: true });
                }

                await interaction.deferReply({ ephemeral: true });
                const attachment = interaction.options.getAttachment('เลือกไฟล์');

                if (!attachment || !attachment.name.endsWith('.zip')) {
                    const embed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('``❌`` เอ๊ะ! ข้อผิดพลาดในการเพิ่มอิโมจิ')
                        .setDescription('```กรุณาอัพโหลดไฟล์นามสกุล .ZIP เท่านั้น```');
                    return interaction.editReply({ embeds: [embed] });
                }

                const tempFilePath = path.join(__dirname, attachment.name);

                try {
                    const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
                    const buffer = Buffer.from(response.data);
                    fs.writeFileSync(tempFilePath, buffer);

                    const zip = new AdmZip(tempFilePath);
                    const zipEntries = zip.getEntries();

                    let addedCount = 0;
                    const failedToAdd = [];
                    const invalidFiles = [];

                    await interaction.editReply({ content: '``⏳`` กำลังเพิ่มอิโมจิ กรุณารอสักครู่...', embeds: [] });

                    for (const entry of zipEntries) {
                        if (!entry.isDirectory) {
                            const fileName = entry.entryName;
                            const fileExtension = path.extname(fileName).toLowerCase();

                            if (['.png', '.jpg', '.jpeg', '.gif'].includes(fileExtension)) {
                                const emojiName = path.parse(fileName).name.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 32);
                                const fileBuffer = entry.getData();

                                try {
                                    const exists = interaction.guild.emojis.cache.find(e => e.name === emojiName);
                                    if (exists) {
                                        failedToAdd.push(`${emojiName} (ซ้ำ)`);
                                        continue;
                                    }
                                    if (fileBuffer.length > 256 * 1024) {
                                        failedToAdd.push(`${emojiName} (ใหญ่เกินไป)`);
                                        continue;
                                    }

                                    await interaction.guild.emojis.create({ attachment: fileBuffer, name: emojiName });
                                    addedCount++;
                                    await new Promise(resolve => setTimeout(resolve, 1500));
                                } catch (err) {
                                    failedToAdd.push(emojiName);
                                }
                            } else {
                                invalidFiles.push(fileName);
                            }
                        }
                    }

                    const embed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('``💬`` การเพิ่มอิโมจิ')
                        .setTimestamp();

                    if (addedCount > 0) {
                        embed.setDescription(`\`\`\`🌵 เพิ่มอิโมจิในเซิฟเวอร์สำเร็จ ${addedCount} รายการ\`\`\``);
                    } else {
                        embed.setDescription('```⛔ ไม่พบอิโมจิในไฟล์ / ไม่สามารถเพิ่มอิโมจิได้```');
                    }

                    if (failedToAdd.length > 0) {
                        embed.addFields({ name: '```❌ เพิ่มอิโมจิไม่สำเร็จ```', value: failedToAdd.join(', ') });
                    }
                    if (invalidFiles.length > 0) {
                        embed.addFields({ name: '```⛔ ไฟล์นี้ไม่รองรับ```', value: invalidFiles.join(', ') });
                    }

                    await interaction.editReply({ content: null, embeds: [embed] });

                } catch (err) {
                    const embed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('``❌`` เอ๊ะ! เกิดข้อผิดพลาด')
                        .setDescription('```เกิดข้อผิดพลาดในการประมวลผลไฟล์ .ZIP```');
                    await interaction.editReply({ embeds: [embed] });
                } finally {
                    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                }

            } else if (interaction.commandName === 'check_emoji') {
                if (!AdminIds.includes(interaction.user.id)) {
                    return interaction.reply({ content: '```❌ คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้```', ephemeral: true });
                }

                await interaction.deferReply({ ephemeral: true });
                const emojis = interaction.guild.emojis.cache;
                
                const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle(`\`\`💬\`\` อิโมจิทั้งหมดใน ${interaction.guild.name}`)
                    .setTimestamp();

                if (!emojis.size) {
                    embed.setDescription('```❌ ไม่พบอิโมจิในเซิร์ฟเวอร์นี้```');
                    return interaction.editReply({ embeds: [embed] });
                }

                const staticEmojis = emojis.filter(e => !e.animated).map(e => `<:${e.name}:${e.id}>`).join(' ') || 'ไม่มี';
                const animatedEmojis = emojis.filter(e => e.animated).map(e => `<a:${e.name}:${e.id}>`).join(' ') || 'ไม่มี';

                embed.addFields(
                    { name: `\`\`\`🌳 IMAGE \`\`\` (${emojis.filter(e => !e.animated).size})`, value: staticEmojis.length > 1024 ? staticEmojis.substring(0, 1021) + '...' : staticEmojis },
                    { name: `\`\`\`🐊 GIF \`\`\`(${emojis.filter(e => e.animated).size})`, value: animatedEmojis.length > 1024 ? animatedEmojis.substring(0, 1021) + '...' : animatedEmojis }
                );

                await interaction.editReply({ embeds: [embed] });

            } else if (interaction.commandName === 'copy_emoji') {
                if (!AdminIds.includes(interaction.user.id)) {
                    return interaction.reply({ content: '```❌ คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้```', ephemeral: true });
                }

                const modal = new ModalBuilder()
                    .setCustomId('copy_emoji_modal')
                    .setTitle('🍀 ก็อปปี้อิโมจิ');

                const tokenInput = new TextInputBuilder()
                    .setCustomId('user_token')
                    .setLabel('[ 🔑 User Token ]')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('กรอกโทเค่นของคุณ')
                    .setRequired(true);

                const sourceIdInput = new TextInputBuilder()
                    .setCustomId('source_guild_id')
                    .setLabel('[ 🍀 Source ID ]')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('กรอกไอดีเซิร์ฟเวอร์ต้นทาง')
                    .setRequired(true);

                const targetIdInput = new TextInputBuilder()
                    .setCustomId('target_guild_id')
                    .setLabel('[ 🌵 Guild ID (ว่างไว้โหลด ZIP) ]')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('ปล่อยว่างเพื่อโหลดเป็นไฟล์ ZIP')
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(tokenInput),
                    new ActionRowBuilder().addComponents(sourceIdInput),
                    new ActionRowBuilder().addComponents(targetIdInput)
                );

                await interaction.showModal(modal);
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'copy_emoji_modal') {
                await interaction.deferReply({ ephemeral: true });

                const userToken = interaction.fields.getTextInputValue('user_token');
                const sourceGuildId = interaction.fields.getTextInputValue('source_guild_id');
                const targetGuildId = interaction.fields.getTextInputValue('target_guild_id');

                try {
                    const response = await axios.get(
                        `https://discord.com/api/v10/guilds/${sourceGuildId}/emojis`,
                        {
                            headers: {
                                Authorization: userToken
                            }
                        }
                    );

                    const sourceEmojis = response.data;

                    if (!sourceEmojis || sourceEmojis.length === 0) {
                        const errorEmbed = new EmbedBuilder()
                            .setColor(0xED4245)
                            .setTitle('``❌`` ไม่พบอิโมจิ')
                            .setDescription('```ไม่พบอิโมจิในเซิร์ฟเวอร์ต้นทาง หรือ Token ของคุณผิด```');

                        return interaction.editReply({ embeds: [errorEmbed] });
                    }

                    if (!targetGuildId) {
                        const zip = new AdmZip();

                        const loadingEmbed = new EmbedBuilder()
                            .setColor(0xFEE75C)
                            .setTitle('``⏳`` กำลังโหลดอิโมจิ')
                            .setDescription('```กำลังเตรียมไฟล์อิโมจิ โปรดรอสักครู่...```');

                        await interaction.editReply({ embeds: [loadingEmbed] });

                        for (const emoji of sourceEmojis) {
                            const extension = emoji.animated ? 'gif' : 'png';
                            const emojiUrl = `https://cdn.discordapp.com/emojis/${emoji.id}.${extension}`;

                            try {
                                const imgRes = await axios.get(emojiUrl, { responseType: 'arraybuffer' });
                                zip.addFile(`${emoji.name}.${extension}`, Buffer.from(imgRes.data));
                            } catch (err) {}
                        }

                        const zipBuffer = zip.toBuffer();
                        const attachment = new AttachmentBuilder(zipBuffer, {
                            name: `emojis_${sourceGuildId}.zip`
                        });

                        const successEmbed = new EmbedBuilder()
                            .setColor(0x57F287)
                            .setTitle('``🍀`` ดึงข้อมูลอิโมจิสำเร็จ')
                            .setDescription(`\`\`\`โหลดอิโมจิสำเร็จแล้ว ${sourceEmojis.length} รายการ\`\`\``);

                        await interaction.editReply({
                            embeds: [successEmbed],
                            files: [attachment]
                        });

                    } else {
                        const targetGuild = client.guilds.cache.get(targetGuildId);

                        if (!targetGuild) {
                            const errorEmbed = new EmbedBuilder()
                                .setColor(0xED4245)
                                .setTitle('``❌`` ไม่พบเซิร์ฟเวอร์ปลายทาง')
                                .setDescription('```บอทไม่ได้อยู่ในเซิร์ฟเวอร์ปลายทางนี้ หรือกรอก ID ผิด```');

                            return interaction.editReply({ embeds: [errorEmbed] });
                        }

                        let copiedCount = 0;

                        const startEmbed = new EmbedBuilder()
                            .setColor(0xFEE75C)
                            .setTitle('``⏳`` กำลังก็อปปี้อิโมจิ')
                            .setDescription(`
\`\`🌳\`\` เซิร์ฟเวอร์ปลายทาง : **${targetGuild.name}**
\`\`💬\`\` ความคืบหน้า : **0/${sourceEmojis.length}**
                            `);

                        await interaction.editReply({ embeds: [startEmbed] });

                        for (const emoji of sourceEmojis) {
                            try {
                                const extension = emoji.animated ? 'gif' : 'png';
                                const emojiUrl = `https://cdn.discordapp.com/emojis/${emoji.id}.${extension}`;

                                const imgRes = await axios.get(emojiUrl, { responseType: 'arraybuffer' });

                                await targetGuild.emojis.create({
                                    attachment: Buffer.from(imgRes.data),
                                    name: emoji.name
                                });

                                copiedCount++;

                                const progressEmbed = new EmbedBuilder()
                                    .setColor(0xFEE75C)
                                    .setTitle('``⏳`` กำลังก็อปปี้อิโมจิ')
                                    .setDescription(`
\`\`🌳\`\` เซิร์ฟเวอร์ปลายทาง : **${targetGuild.name}**
\`\`💬\`\` ความคืบหน้า : **${copiedCount}/${sourceEmojis.length}**
                                    `);

                                await interaction.editReply({ embeds: [progressEmbed] });
                                await new Promise(resolve => setTimeout(resolve, 1500));

                            } catch (err) {
                                console.error(err);
                            }
                        }

                        const doneEmbed = new EmbedBuilder()
                            .setColor(0x57F287)
                            .setTitle('``🍀`` ก็อปปี้อิโมจิสำเร็จ')
                            .setDescription(`
\`\`🌵\`\` ก็อปปี้อิโมจิสำเร็จทั้งหมด : **${copiedCount}** รายการ
\`\`🍃\`\` ไปยังเซิร์ฟเวอร์ : **${targetGuild.name}**
                            `);

                        await interaction.editReply({ embeds: [doneEmbed] });
                    }

                } catch (err) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor(0xED4245)
                        .setTitle('``❌`` เอ๊ะ! เกิดข้อผิดพลาด')
                        .setDescription(`\`\`\`${err.response?.data?.message || err.message}\`\`\``);

                    await interaction.editReply({ embeds: [errorEmbed] });
                }
            }
        }
    });
};
