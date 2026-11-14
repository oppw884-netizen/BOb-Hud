const { EmbedBuilder, Events, SlashCommandBuilder } = require('discord.js');

// รายการคำสั่งทั้งหมด — เพิ่มคำสั่งใหม่แล้วมาใส่ตรงนี้ จะโผล่ใน !help และ /help เอง
const COMMANDS = [
    { usage: '!ping', aliases: ['!status'], description: 'เช็กความหน่วง เวลาเปิดทำงาน จำนวนสมาชิกและเซิร์ฟเวอร์' },
    { usage: '!roblox <ชื่อผู้ใช้>', aliases: [], description: 'ดูข้อมูลผู้เล่น Roblox เพื่อน กลุ่ม ไอเทมที่ใส่ และมูลค่า Robux' },
    { usage: '!help', aliases: ['/help'], description: 'แสดงรายการคำสั่งนี้' },
];

function buildHelpEmbed() {
    const lines = COMMANDS.map((c) => {
        const names = [c.usage, ...c.aliases].map((n) => `\`${n}\``).join(' หรือ ');
        return `${names}\n└ ${c.description}`;
    });

    return new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📖 คำสั่งของ BOb-Hud Bot')
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: 'พิมพ์คำสั่งขึ้นต้นด้วย ! ในช่องแชท' });
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
