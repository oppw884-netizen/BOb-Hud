const {
    EmbedBuilder,
    Events,
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const MENU_ID = 'help_menu';
const TIMEOUT_MS = 120000; // เมนูใช้งานได้ 2 นาที

// เพิ่มคำสั่ง/หมวดใหม่ได้ที่นี่ เมนูและหน้า help จะอัปเดตเอง
// บรรทัดที่มี "แก้ให้ตรง" คือชื่อคำสั่งที่ผมเดา ให้แก้เป็นของจริง
const CATEGORIES = [
    {
        id: 'general',
        emoji: '🔧',
        name: 'ทั่วไป',
        color: '#5865F2',
        blurb: 'คำสั่งพื้นฐานสำหรับทุกคน',
        commands: [
            { usage: '!ping', aliases: ['!status'], description: 'เช็กความหน่วง เวลาเปิดทำงาน จำนวนสมาชิกและเซิร์ฟเวอร์' },
            { usage: '!help', aliases: ['/help'], description: 'เปิดศูนย์ช่วยเหลือนี้' },
        ],
    },
    {
        id: 'game',
        emoji: '🎮',
        name: 'เกมและข้อมูล',
        color: '#F1C40F',
        blurb: 'เล่นสนุกและดูข้อมูลผู้เล่น',
        commands: [
            { usage: '!roblox <ชื่อผู้ใช้>', aliases: [], description: 'ดูข้อมูลผู้เล่น Roblox เพื่อน กลุ่ม ไอเทม และมูลค่า Robux' },
            { usage: '!xo', aliases: [], description: 'เล่นเกม XO กับเพื่อน' }, // แก้ให้ตรง
        ],
    },
    {
        id: 'tools',
        emoji: '🧰',
        name: 'เครื่องมือ',
        color: '#2ECC71',
        blurb: 'ตัวช่วยใช้งานทุกวัน',
        commands: [
            { usage: '!translate <ข้อความ>', aliases: [], description: 'แปลข้อความเป็นภาษาไทย' },
            { usage: '!qr <ลิงก์/ข้อความ>', aliases: [], description: 'สร้างรูป QR code จากลิงก์หรือข้อความ' },
            { usage: '/emoji', aliases: [], description: 'คัดลอกอีโมจิ' }, // แก้ให้ตรง
        ],
    },
    {
        id: 'admin',
        emoji: '🛠️',
        name: 'แอดมิน',
        color: '#E74C3C',
        blurb: 'สำหรับผู้ดูแลเซิร์ฟเวอร์',
        commands: [
            { usage: '/announce', aliases: [], description: 'ส่งประกาศไปยังห้องที่เลือก' }, // แก้ให้ตรง
        ],
    },
];

const totalCommands = CATEGORIES.reduce((n, c) => n + c.commands.length, 0);

// หน้าแรก
function buildHomeEmbed(client) {
    const avatar = client.user?.displayAvatarURL({ size: 256 });

    const overview = CATEGORIES.map(
        (c) => `${c.emoji} **${c.name}** — ${c.blurb} \`${c.commands.length}\``
    ).join('\n');

    return new EmbedBuilder()
        .setColor('#5865F2')
        .setAuthor({ name: `${client.user?.username ?? 'BOb-Hud BOT'} • ศูนย์ช่วยเหลือ`, iconURL: avatar })
        .setTitle('✨ ยินดีต้อนรับสู่ศูนย์ช่วยเหลือ')
        .setDescription(
            '```\nเลือกหมวดหมู่จากเมนูด้านล่างเพื่อดูคำสั่งได้เลย\n```\n' +
            overview +
            '\n\n> 📌 `< >` = ต้องใส่  ·  พิมพ์คำสั่งในห้องแชตได้ทันที'
        )
        .setThumbnail(avatar ?? null)
        .addFields(
            { name: '📦 คำสั่งทั้งหมด', value: `\`${totalCommands}\``, inline: true },
            { name: '📂 หมวดหมู่', value: `\`${CATEGORIES.length}\``, inline: true },
            { name: '🏓 Ping', value: `\`${client.ws.ping}ms\``, inline: true }
        )
        .setFooter({ text: 'Made by BOb-Hud BOT' })
        .setTimestamp();
}

// หน้าของแต่ละหมวด
function buildCategoryEmbed(client, category) {
    const lines = category.commands.map((c) => {
        const names = [c.usage, ...c.aliases].map((n) => `\`${n}\``).join(' · ');
        return `### ${names}\n> ${c.description}`;
    });

    return new EmbedBuilder()
        .setColor(category.color)
        .setAuthor({
            name: `${client.user?.username ?? 'BOb-Hud BOT'} • ศูนย์ช่วยเหลือ`,
            iconURL: client.user?.displayAvatarURL(),
        })
        .setTitle(`${category.emoji} ${category.name}`)
        .setDescription(`*${category.blurb}*\n\n${lines.join('\n')}`)
        .setFooter({ text: `หมวด ${category.name} · ${category.commands.length} คำสั่ง` })
        .setTimestamp();
}

function buildComponents(selectedId = null, disabled = false) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(MENU_ID)
        .setPlaceholder('📂 เลือกหมวดหมู่คำสั่ง...')
        .setDisabled(disabled)
        .addOptions([
            { label: 'หน้าแรก', value: 'home', emoji: '🏠', description: 'กลับไปหน้าหลัก', default: selectedId === 'home' },
            ...CATEGORIES.map((c) => ({
                label: c.name,
                value: c.id,
                emoji: c.emoji,
                description: `${c.commands.length} คำสั่ง · ${c.blurb}`.slice(0, 100),
                default: selectedId === c.id,
            })),
        ]);

    const row1 = new ActionRowBuilder().addComponents(menu);

    // ปุ่มด้านล่าง: ใส่ลิงก์ของคุณได้ (ต้องเป็น https://) ถ้ายังไม่มี ลบ row2 ทิ้งได้
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('เซิร์ฟเวอร์ซัพพอร์ต')
            .setEmoji('💬')
            .setStyle(ButtonStyle.Link)
            .setURL(process.env.SUPPORT_URL || 'https://discord.com') // แก้ให้ตรง
    );

    return [row1, row2];
}

async function sendHelp(client, sendFn, userId) {
    const msg = await sendFn({
        embeds: [buildHomeEmbed(client)],
        components: buildComponents('home'),
        fetchReply: true,
    });

    const collector = msg.createMessageComponentCollector({ time: TIMEOUT_MS });

    collector.on('collect', async (i) => {
        if (i.customId !== MENU_ID) return;

        // เฉพาะคนที่เรียก help
