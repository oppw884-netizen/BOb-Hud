require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
  MessageFlags,
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// ---------- เก็บข้อมูลแผง (ต่อ message id ซึ่งไม่ซ้ำกันทุกเซิร์ฟเวอร์) ----------
const DATA_FILE = path.join(__dirname, 'data.json');
let db = {}; // { [messageId]: { guildId, channelId, mode, roles: [roleId] } }
try {
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch {}
const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));

const MAX_ROLES = 25; // ลิมิตของ Select Menu
const ROLE_SLOTS = 10; // จำนวนช่องยศตอนสร้างแผง (เพิ่มทีหลังได้ด้วย /rolepanel add)
const DANGEROUS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
];

const ephemeral = (content, extra = {}) => ({
  content,
  flags: MessageFlags.Ephemeral,
  allowedMentions: { parse: [] },
  ...extra,
});

// ---------- คำสั่ง ----------
const cmd = new SlashCommandBuilder()
  .setName('rolepanel')
  .setDescription('จัดการแผงรับยศ')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setDMPermission(false)
  .addSubcommand((s) => {
    s.setName('create')
      .setDescription('สร้างแผงรับยศในห้องนี้')
      .addStringOption((o) => o.setName('title').setDescription('หัวข้อแผง').setRequired(true))
      .addRoleOption((o) => o.setName('role1').setDescription('ยศที่ 1').setRequired(true))
      .addStringOption((o) => o.setName('description').setDescription('คำอธิบาย (ขึ้นบรรทัดใหม่ด้วย \\n)'))
      .addStringOption((o) => o.setName('image_url').setDescription('ลิงก์รูปแบนเนอร์'))
      .addStringOption((o) =>
        o
          .setName('mode')
          .setDescription('single = เลือกได้ 1 ยศ, multiple = เลือกได้หลายยศ')
          .addChoices({ name: 'เลือกได้ 1 ยศ', value: 'single' }, { name: 'เลือกได้หลายยศ', value: 'multiple' })
      );
    for (let n = 2; n <= ROLE_SLOTS; n++) {
      s.addRoleOption((o) => o.setName(`role${n}`).setDescription(`ยศที่ ${n}`));
    }
    return s;
  })
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('เพิ่มยศเข้าแผงที่มีอยู่')
      .addStringOption((o) => o.setName('message_id').setDescription('ID ข้อความของแผง').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('ยศที่จะเพิ่ม').setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName('remove')
      .setDescription('เอายศออกจากแผง')
      .addStringOption((o) => o.setName('message_id').setDescription('ID ข้อความของแผง').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('ยศที่จะเอาออก').setRequired(true))
  )
  .toJSON();

client.once('clientReady', async () => {
  await client.application.commands.set([cmd]); // global = ใช้ได้ทุกเซิร์ฟเวอร์
  console.log(`✅ ออนไลน์ในชื่อ ${client.user.tag} | อยู่ ${client.guilds.cache.size} เซิร์ฟเวอร์`);
});

// ---------- ตัวช่วย ----------
function buildComponents(guild, panel) {
  const roles = panel.roles.map((id) => guild.roles.cache.get(id)).filter(Boolean);
  const select = new StringSelectMenuBuilder()
    .setCustomId('rp:select')
    .setPlaceholder(panel.mode === 'multiple' ? 'เลือกยศของคุณ (เลือกได้หลายยศ)' : 'เลือกยศของคุณ')
    .setMinValues(1)
    .setMaxValues(panel.mode === 'multiple' ? roles.length : 1)
    .addOptions(roles.map((r) => ({ label: r.name.slice(0, 100), value: r.id })));
  const reset = new ButtonBuilder()
    .setCustomId('rp:reset')
    .setLabel('รีเซ็ตยศของคุณ')
    .setEmoji('🔄')
    .setStyle(ButtonStyle.Danger);
  return [new ActionRowBuilder().addComponents(select), new ActionRowBuilder().addComponents(reset)];
}

// ตรวจว่ายศนี้แจกได้ไหม (กันแอดมินปลอมสิทธิ์ยกระดับ และกันยศที่บอทแตะไม่ได้)
function checkAssignable(i, role) {
  if (role.id === i.guild.id) return '@everyone ใช้ไม่ได้';
  if (role.managed) return `${role.name} เป็นยศของบอท/อินทิเกรชัน`;
  if (!role.editable) return `ยศบอทต้องอยู่**สูงกว่า** ${role.name} (ลากยศบอทขึ้นในตั้งค่า Roles)`;
  if (role.permissions.any(DANGEROUS)) return `${role.name} มีสิทธิ์อันตราย (แอดมิน/แบน/จัดการ ฯลฯ) จึงไม่อนุญาตให้แจกผ่านแผง`;
  if (i.guild.ownerId !== i.user.id && i.member.roles.highest.comparePositionTo(role) <= 0) {
    return `คุณไม่สามารถแจกยศ ${role.name} ได้ เพราะยศของคุณไม่สูงกว่ายศนั้น`;
  }
  return null;
}

async function refreshPanelMessage(guild, messageId, panel) {
  const channel = await guild.channels.fetch(panel.channelId);
  const msg = await channel.messages.fetch(messageId);
  await msg.edit({ components: buildComponents(guild, panel) });
}

// ---------- จัดการ interaction ----------
client.on('interactionCreate', async (i) => {
  try {
    if (!i.inGuild()) return;

    // /rolepanel ...
    if (i.isChatInputCommand() && i.commandName === 'rolepanel') {
      const sub = i.options.getSubcommand();
      await i.guild.roles.fetch();

      if (sub === 'create') {
        const roles = [];
        for (let n = 1; n <= ROLE_SLOTS; n++) {
          const r = i.options.getRole(`role${n}`);
          if (r && !roles.some((x) => x.id === r.id)) roles.push(r);
        }
        for (const r of roles) {
          const err = checkAssignable(i, r);
          if (err) return i.reply(ephemeral(`❌ ${err}`));
        }

        const imageUrl = i.options.getString('image_url');
        if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
          return i.reply(ephemeral('❌ ลิงก์รูปต้องขึ้นต้นด้วย http:// หรือ https://'));
        }

        const embed = new EmbedBuilder()
          .setColor(0xff6b9d)
          .setTitle(i.options.getString('title'))
          .setFooter({ text: '๛ หากต้องการเอายศออกสามารถกดรีเซ็ตได้เลย' });
        const desc = i.options.getString('description');
        if (desc) embed.setDescription(desc.replace(/\\n/g, '\n'));
        if (imageUrl) embed.setImage(imageUrl);

        const panel = {
          guildId: i.guildId,
          channelId: i.channelId,
          mode: i.options.getString('mode') ?? 'single',
          roles: roles.map((r) => r.id),
        };
        const msg = await i.channel.send({ embeds: [embed], components: buildComponents(i.guild, panel) });
        db[msg.id] = panel;
        save();
        return i.reply(ephemeral(`✅ สร้างแผงเรียบร้อย (ID ข้อความ: \`${msg.id}\`) — ใช้ ID นี้กับ /rolepanel add / remove`));
      }

      // add / remove
      const messageId = i.options.getString('message_id');
      const panel = db[messageId];
      if (!panel || panel.guildId !== i.guildId) {
        return i.reply(ephemeral('❌ ไม่พบแผงนี้ในเซิร์ฟเวอร์นี้ (ตรวจ ID ข้อความอีกครั้ง)'));
      }
      const role = i.options.getRole('role');

      if (sub === 'add') {
        if (panel.roles.includes(role.id)) return i.reply(ephemeral('ยศนี้อยู่ในแผงแล้วครับ'));
        if (panel.roles.length >= MAX_ROLES) return i.reply(ephemeral(`❌ แผงหนึ่งใส่ได้สูงสุด ${MAX_ROLES} ยศ`));
        const err = checkAssignable(i, role);
        if (err) return i.reply(ephemeral(`❌ ${err}`));
        panel.roles.push(role.id);
      } else {
        if (!panel.roles.includes(role.id)) return i.reply(ephemeral('ยศนี้ไม่ได้อยู่ในแผงครับ'));
        if (panel.roles.length === 1) return i.reply(ephemeral('❌ แผงต้องมีอย่างน้อย 1 ยศ'));
        panel.roles = panel.roles.filter((id) => id !== role.id);
      }
      await refreshPanelMessage(i.guild, messageId, panel);
      save();
      return i.reply(ephemeral(sub === 'add' ? `✅ เพิ่ม ${role.name} เข้าแผงแล้ว` : `✅ เอา ${role.name} ออกจากแผงแล้ว`));
    }

    // สมาชิกเลือกยศ
    if (i.isStringSelectMenu() && i.customId === 'rp:select') {
      const panel = db[i.message.id];
      if (!panel) return i.reply(ephemeral('⚠️ แผงนี้ไม่ได้ลงทะเบียนไว้ ให้แอดมินสร้างใหม่ด้วย /rolepanel create'));
      await i.deferReply({ flags: MessageFlags.Ephemeral });

      await i.guild.roles.fetch();
      const member = await i.guild.members.fetch(i.user.id);
      const valid = panel.roles.filter((id) => i.guild.roles.cache.has(id));
      const selected = i.values.filter((v) => valid.includes(v));

      const toRemove = valid.filter((id) => !selected.includes(id) && member.roles.cache.has(id));
      const toAdd = selected.filter((id) => !member.roles.cache.has(id));

      const stuck = [...toRemove, ...toAdd].find((id) => !i.guild.roles.cache.get(id).editable);
      if (stuck) {
        return i.editReply('❌ ยศบอทต้องอยู่สูงกว่ายศในแผงนี้ ให้แอดมินลากยศบอทขึ้นไปด้านบนครับ');
      }

      if (toRemove.length) await member.roles.remove(toRemove, 'แผงรับยศ');
      if (toAdd.length) await member.roles.add(toAdd, 'แผงรับยศ');

      return i.editReply({
        content: `✅ ตอนนี้คุณมียศ: ${selected.map((id) => `<@&${id}>`).join(' ')}`,
        allowedMentions: { parse: [] },
      });
    }

    // รีเซ็ตยศ
    if (i.isButton() && i.customId === 'rp:reset') {
      const panel = db[i.message.id];
      if (!panel) return i.reply(ephemeral('⚠️ แผงนี้ไม่ได้ลงทะเบียนไว้'));
      await i.deferReply({ flags: MessageFlags.Ephemeral });

      await i.guild.roles.fetch();
      const member = await i.guild.members.fetch(i.user.id);
      const toRemove = panel.roles.filter((id) => member.roles.cache.has(id) && i.guild.roles.cache.get(id)?.editable);
      if (toRemove.length) await member.roles.remove(toRemove, 'รีเซ็ตยศจากแผง');
      return i.editReply(toRemove.length ? `🔄 เอายศออก ${toRemove.length} ยศเรียบร้อย` : 'คุณยังไม่มียศจากแผงนี้ครับ');
    }
  } catch (err) {
    console.error(err);
    const msg = ephemeral('⚠️ เกิดข้อผิดพลาด ลองใหม่อีกครั้งนะครับ');
    if (i.deferred || i.replied) i.followUp(msg).catch(() => {});
    else i.reply(msg).catch(() => {});
  }
});

// ล้างข้อมูลเมื่อแผงถูกลบ / บอทถูกเตะออก
client.on('messageDelete', (m) => {
  if (db[m.id]) {
    delete db[m.id];
    save();
  }
});
client.on('guildDelete', (g) => {
  for (const [id, p] of Object.entries(db)) if (p.guildId === g.id) delete db[id];
  save();
});

client.login(process.env.DISCORD_TOKEN);
