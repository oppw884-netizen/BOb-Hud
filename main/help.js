const { EmbedBuilder, Events, SlashCommandBuilder } = require('discord.js');

// แบ่งคำสั่งเป็นหมวดหมู่ — เพิ่มคำสั่งใหม่หรือหมวดใหม่ได้ที่นี่ จะโผล่ใน !help และ /help เอง
const CATEGORIES = [
    {
        emoji: '🔧',
        name: 'Script Commands',
        commands: [
            { usage: '!ping', aliases: ['!status'], description: 'เช็กความหน่วง เวลาเปิดทำงาน จำนวนสมาชิกและเซิร์ฟเวอร์' },
            { usage: '!roblox <ชื่อผู้ใช้>', aliases: [], description: 'ดูข้อมูลผู้เล่น Roblox เพื่อน กลุ่ม ไอเทมที่ใส่ และมูลค่า Robux' },
        ],
    },
    {
        emoji: '🛠️',
        name: 'Admin Commands',
        commands: [
            { usage: '!help', aliases: ['/help'], description: 'แสดงรายการคำสั่งทั้งหมด' },
        ],
    },
];

function buildHelpEmbed() {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📋 คำสั่งทั้งหมด')
        .setFooter({ text: 'Made by BOb-Hud BOT' });

    for (const category of CATEGORIES) {
        const lines = category.commands.map((c) => {
            const names = [c.usage, ...c.aliases].map((n) => `\`${n}\``).join(' — ');
            return `${names} — ${c.description}`;
        });

        embed.addFields({
            name: `${category.emoji} ${category.name}`,
            value: lines.join('\n'),
        });
    }

    return embed;
}

module.exports = function registerHelp(client) {
    // !help
    client.on(Events.MessageCreate, async (message) => {
        if (message.author.bot) return;
        if (message.content.trim().toLowerCase() !== '!help') return;

        try {
            await message.reply({ embeds: [buildHelpEmbed()] });
        } catch (error) {
            console.error('คำสั่ง !help ผิดพลาด:', error);
        }
    });

    // /help
    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isChatInputCommand() || interaction.commandName !== 'help') return;

        try {
            await interaction.reply({ embeds: [buildHelpEmbed()] });
        } catch (error) {
            console.error('คำสั่ง /help ผิดพลาด:', error);
        }
    });

    // ลงทะเบียน /help ตอนบอทออนไลน์
    // ถ้าตั้ง GUILD_ID จะขึ้นทันทีในเซิร์ฟเวอร์นั้น ถ้าไม่ตั้งจะเป็น global (อาจใช้เวลาสักพักกว่าจะขึ้น)
    client.once(Events.ClientReady, async () => {
        try {
            const definition = new SlashCommandBuilder()
                .setName('help')
                .setDescription('แสดงรายการคำสั่งของบอท')
                .toJSON();

            const guildId = process.env.GUILD_ID;
            const guild = guildId ? client.guilds.cache.get(guildId) : null;

            if (guild) {
                await guild.commands.set([definition]);
                console.log(`ลงทะเบียน /help ในเซิร์ฟเวอร์ ${guild.name} แล้ว`);
            } else {
                await client.application.commands.set([definition]);
                console.log('ลงทะเบียน /help แบบ global แล้ว');
            }
        } catch (error) {
            console.error('ลงทะเบียน /help ไม่สำเร็จ (!help ยังใช้ได้ปกติ):', error.message);
        }
    });
};
