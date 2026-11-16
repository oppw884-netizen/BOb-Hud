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
const BTN_PREV = 'help_prev';
const BTN_HOME = 'help_home';
const BTN_NEXT = 'help_next';
const TIMEOUT_MS = 120000; // เมนูใช้งานได้ 2 นาที
const BRAND_COLOR = '#5865F2';
const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━';

// เพิ่มคำสั่ง/หมวดใหม่ได้ที่นี่ เมนู ปุ่ม และหน้า help จะอัปเดตเอง
// บรรทัดที่มี "แก้ให้ตรง" คือชื่อคำสั่งที่เดา ให้แก้เป็นของจริง
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
            { usage: '!xo @ผู้เล่น1 @ผู้เล่น2', aliases: [], description: 'เริ่มเกม XO สำหรับ 2 คน' },
            { usage: '!วาง [1-9]', aliases: [], description: 'วางหมากในช่องที่เลือก' },
            { usage: '!xostop', aliases: [], description: 'หยุดเกม XO ในห้องนี้' },
            { usage: '!xohelp', aliases: [], description: 'ดูวิธีเล่นเกม XO' },
        ],
    },
    {
        id: 'music',
        emoji: '🎵',
        name: 'เพลง',
        color: '#9B59B6',
        blurb: 'เปิดเพลงในห้องเสียง',
        commands: [
            { usage: '/play <ลิงก์หรือชื่อเพลง>', aliases: [], description: 'เปิดเพลง หรือเพิ่มเข้าคิว' },
            { usage: '/pause', aliases: ['/resume'], description: 'หยุดเพลงชั่วคราว / เล่นต่อ' },
            { usage: '/skip', aliases: ['/previous'], description: 'ข้ามเพลง / เล่นเพลงก่อนหน้า' },
            { usage: '/queue', aliases: ['/nowplaying'], description: 'ดูคิวเพลง / ดูเพลงที่กำลังเล่น' },
            { usage: '/clear', aliases: [], description: 'ล้างคิวเพลงทั้งหมด' },
            { usage: '/loop', aliases: [], description: 'วนลูปเพลงนี้ / ทั้งคิว / ปิด' },
            { usage: '/volume', aliases: [], description: 'ปรับระดับเสียง (0–100)' },
            { usage: '/leave', aliases: [], description: 'หยุดเล่นและออกจากห้องเสียง' },
            { usage: '/nodes', aliases: [], description: 'ดูสถานะเครื่องเปิดเพลง' },
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

// ลำดับหน้าทั้งหมด: หน้าแรก + แต่ละหมวด
const PAGES = ['home', ...CATEGORIES.map((c) => c.id)];

const totalCommands = CATEGORIES.reduce((n, c) => n + c.commands.length, 0);

function pingBadge(ms) {
    if (ms < 0) return '⚪ กำลังวัด...';
    if (ms < 120) return `🟢 ${ms}ms`;
    if (ms < 250) return `🟡 ${ms}ms`;
    return `🔴 ${ms}ms`;
}

function authorOf(client) {
    return {
        name: `${client.user?.username ?? 'BOb-Hud BOT'}  •  ศูนย์ช่วยเหลือ`,
        iconURL: client.user?.displayAvatarURL(),
    };
}

// ───────── หน้าแรก ─────────
function buildHomeEmbed(client) {
    const avatar = client.user?.displayAvatarURL({ size: 256 });

    const overview = CATEGORIES.map(
        (c) => `${c.emoji}  **${c.name}**  \`${String(c.commands.length).padStart(2, '0')}\`\n┗ *${c.blurb}*`
    ).join('\n\n');

    return new EmbedBuilder()
        .setColor(BRAND_COLOR)
        .setAuthor(authorOf(client))
        .setTitle('✨  ยินดีต้อนรับสู่ศูนย์ช่วยเหลือ  ✨')
        .setDescription(
            '```ansi\n' +
            '\u001b[1;34m▸ เลือกหมวดหมู่จากเมนูด้านล่าง\u001b[0m\n' +
            '\u001b[0;36m▸ หรือกดปุ่ม ◀ ▶ เพื่อไล่ดูทีละหมวด\u001b[0m\n' +
            '```' +
            `${DIVIDER}\n\n` +
            overview +
            `\n\n${DIVIDER}\n` +
            '> 💡 `< >` = ต้องใส่  ·  `[ ]` = ตัวเลือก  ·  พิมพ์คำสั่งในห้องแชตได้ทันที'
        )
        .setThumbnail(avatar ?? null)
        .addFields(
            { name: '📦  คำสั่งทั้งหมด', value: `\`\`\`${totalCommands}\`\`\``, inline: true },
            { name: '📂  หมวดหมู่', value: `\`\`\`${CATEGORIES.length}\`\`\``, inline: true },
            { name: '🏓  Ping', value: `${pingBadge(Math.round(client.ws.ping))}`, inline: true }
        )
        .setFooter({ text: `Made by BOb-Hud BOT  •  หน้า 1/${PAGES.length}` })
        .setTimestamp();
}

// ───────── หน้าของแต่ละหมวด ─────────
function buildCategoryEmbed(client, category) {
    const pageNo = PAGES.indexOf(category.id) + 1;

    const lines = category.commands.map((c, i) => {
        const num = String(i + 1).padStart(2, '0');
        const alias = c.aliases.length
            ? `\n↳ ใช้แทนกันได้: ${c.aliases.map((a) => `\`${a}\``).join(' · ')}`
            : '';
        return `**\`${num}\`**  \`${c.usage}\`${alias}\n> ${c.description}`;
    });

    return new EmbedBuilder()
        .setColor(category.color)
        .setAuthor(authorOf(client))
        .setTitle(`${category.emoji}  ${category.name}`)
        .setDescription(`*${category.blurb}*\n${DIVIDER}\n\n${lines.join('\n\n')}`)
        .setThumbnail(client.user?.displayAvatarURL({ size: 128 }) ?? null)
        .setFooter({ text: `หมวด ${category.name}  •  ${category.commands.length} คำสั่ง  •  หน้า ${pageNo}/${PAGES.length}` })
        .setTimestamp();
}

function buildEmbed(client, pageId) {
    if (pageId === 'home') return buildHomeEmbed(client);
    return buildCategoryEmbed(client, CATEGORIES.find((c) => c.id === pageId));
}

// ───────── เมนู + ปุ่ม ─────────
function buildComponents(pageId = 'home', disabled = false) {
    const index = PAGES.indexOf(pageId);

    const menu = new StringSelectMenuBuilder()
        .setCustomId(MENU_ID)
        .setPlaceholder('📂  เลือกหมวดหมู่คำสั่ง...')
        .setDisabled(disabled)
        .addOptions([
            { label: 'หน้าแรก', value: 'home', emoji: '🏠', description: 'กลับไปหน้าหลัก', default: pageId === 'home' },
            ...CATEGORIES.map((c) => ({
                label: c.name,
                value: c.id,
                emoji: c.emoji,
                description: `${c.commands.length} คำสั่ง · ${c.blurb}`.slice(0, 100),
                default: pageId === c.id,
            })),
        ]);

    const row1 = new ActionRowBuilder().addComponents(menu);

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(BTN_PREV)
            .setEmoji('◀️')
            .setLabel('ก่อนหน้า')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || index <= 0),
        new ButtonBuilder()
            .setCustomId(BTN_HOME)
            .setEmoji('🏠')
            .setLabel('หน้าแรก')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || pageId === 'home'),
        new ButtonBuilder()
            .setCustomId(BTN_NEXT)
            .setEmoji('▶️')
            .setLabel('ถัดไป')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || index >= PAGES.length - 1),
        // ลิงก์ต้องเป็น https:// ถ้ายังไม่มี ลบปุ่มนี้ทิ้งได้
        new ButtonBuilder()
            .setLabel('ซัพพอร์ต')
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
    });

    let current = 'home';
    const collector = msg.createMessageComponentCollector({ time: TIMEOUT_MS });

    collector.on('collect', async (i) => {
        // เฉพาะคนที่เรียก help เท่านั้นที่กดได้
        if (i.user.id !== userId) {
            return i.reply({
                content: '❌ เมนูนี้เป็นของคนที่พิมพ์ help ครับ ลองพิมพ์ `!help` เองดูนะ',
                ephemeral: true,
            });
        }

        const index = PAGES.indexOf(current);

        if (i.customId === MENU_ID) current = i.values[0];
        else if (i.customId === BTN_HOME) current = 'home';
        else if (i.customId === BTN_PREV) current = PAGES[Math.max(0, index - 1)];
        else if (i.customId === BTN_NEXT) current = PAGES[Math.min(PAGES.length - 1, index + 1)];
        else return;

        await i.update({ embeds: [buildEmbed(client, current)], components: buildComponents(current) });

        // ต่อเวลาให้ทุกครั้งที่ยังใช้งานอยู่
        collector.resetTimer();
    });

    collector.on('end', async () => {
        try {
            await msg.edit({ components: buildComponents(current, true) });
        } catch {
            // ข้อความถูกลบไปแล้ว ไม่ต้องทำอะไร
        }
    });
}

module.exports = function registerHelp(client) {
    // !help
    client.on(Events.MessageCreate, async (message) => {
        if (message.author.bot) return;
        if (message.content.trim().toLowerCase() !== '!help') return;

        try {
            await sendHelp(client, (opts) => message.reply(opts), message.author.id);
        } catch (error) {
            console.error('คำสั่ง !help ผิดพลาด:', error);
        }
    });

    // /help
    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isChatInputCommand() || interaction.commandName !== 'help') return;

        try {
            await sendHelp(
                client,
                async (opts) => {
                    await interaction.reply(opts);
                    return interaction.fetchReply();
                },
                interaction.user.id
            );
        } catch (error) {
            console.error('คำสั่ง /help ผิดพลาด:', error);
        }
    });

    // ลงทะเบียน /help ตอนบอทออนไลน์ (ใช้ create เพื่อไม่ทับ /announce และ Emoji)
    client.once(Events.ClientReady, async () => {
        try {
            const definition = new SlashCommandBuilder()
                .setName('help')
                .setDescription('แสดงรายการคำสั่งของบอท')
                .toJSON();

            const guildId = process.env.GUILD_ID;
            const guild = guildId ? client.guilds.cache.get(guildId) : null;

            if (guild) {
                await guild.commands.create(definition);
                console.log(`ลงทะเบียน /help ในเซิร์ฟเวอร์ ${guild.name} แล้ว`);
            } else {
                await client.application.commands.create(definition);
                console.log('ลงทะเบียน /help แบบ global แล้ว');
            }
        } catch (error) {
            console.error('ลงทะเบียน /help ไม่สำเร็จ (!help ยังใช้ได้ปกติ):', error.message);
        }
    });
};
