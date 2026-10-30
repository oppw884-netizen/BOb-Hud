require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, FileUploadBuilder,
  SlashCommandBuilder, REST, Routes, PermissionFlagsBits, MessageFlags, Events, ChannelType,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // ต้องเปิด Message Content Intent ใน Developer Portal ด้วย
  ],
});

// ---------- เก็บข้อมูลผูกบัญชี (Discord ↔ Roblox) ลงไฟล์ ----------
const DATA_FILE = path.join(__dirname, 'data.json');
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return { links: {} }; }
}
function saveData(d) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); } catch (e) { console.error('บันทึก data.json ไม่ได้', e); }
}

// เลขคำขอ (#1, #2, ...) เก็บต่อเนื่องใน data.json
function nextRequestNo() {
  const d = loadData();
  d.counter = (d.counter || 0) + 1;
  saveData(d);
  return d.counter;
}

// รูปตัวละคร Roblox (ครึ่งตัว) สำหรับการ์ดประกาศผล
async function getRobloxAvatar(robloxId) {
  try {
    const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-bust?userIds=${robloxId}&size=150x150&format=Png`);
    if (!res.ok) return null;
    const item = (await res.json()).data?.[0];
    return item?.state === 'Completed' ? item.imageUrl : null;
  } catch { return null; }
}

// สร้างชื่อเล่นตาม role ของสมาชิก
function buildNick(member, robloxName) {
  const list = Array.isArray(cfg.nicknameByRole) ? cfg.nicknameByRole : (cfg.nicknameByRole ? [cfg.nicknameByRole] : []);
  const special = list.find((r) => member.roles.cache.has(r.roleId));
  const format = special ? special.format : cfg.nicknameFormat;
  return format.replace('{username}', robloxName).slice(0, 32);
}

// ---------- Roblox API ----------
async function getRobloxUser(username) {
  const res = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
  });
  if (!res.ok) throw new Error('Roblox users API error');
  const data = (await res.json()).data;
  return data[0] || null; // {id, name, displayName}
}

async function getRobloxUsersByIds(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const res = await fetch('https://users.roblox.com/v1/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: ids.slice(i, i + 100), excludeBannedUsers: false }),
    });
    if (!res.ok) throw new Error('Roblox users (ids) API error ' + res.status);
    out.push(...(await res.json()).data);
  }
  return out; // [{id, name, displayName}]
}

// ---------- Commands ----------
const commands = [
  new SlashCommandBuilder()
    .setName('setuprankpanel')
    .setDescription('ส่งแผงอัพเดทยศในห้องนี้')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('announceupdate')
    .setDescription('ประกาศอัพเดทเวอร์ชันใหม่ของเกม')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('setupticketpanel')
    .setDescription('ส่งแผงติดต่อแอดมิน (ตั๋ว) ในห้องนี้')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((c) => c.toJSON());

// ---------- ซิงก์ชื่ออัตโนมัติเมื่อเปลี่ยนชื่อ Roblox ----------
async function syncNames() {
  const data = loadData();
  const entries = Object.entries(data.links);
  if (!entries.length) return;
  try {
    const users = await getRobloxUsersByIds([...new Set(entries.map(([, v]) => v.robloxId))]);
    const byId = new Map(users.map((u) => [String(u.id), u]));
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    let changed = 0;
    for (const [discordId, link] of entries) {
      const u = byId.get(String(link.robloxId));
      if (!u || u.name === link.robloxName) continue;
      const member = await guild.members.fetch(discordId).catch(() => null);
      if (!member) continue;
      await member.setNickname(buildNick(member, u.name)).catch(() => {});
      link.robloxName = u.name;
      changed++;
    }
    if (changed) { saveData(data); console.log(`ซิงก์ชื่อแล้ว ${changed} คน`); }
  } catch (e) {
    console.error('ซิงก์ชื่อไม่สำเร็จ', e.message);
  }
}

client.once(Events.ClientReady, async (c) => {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  // ล้างคำสั่งเก่าที่ค้างอยู่แบบ global (เช่นจากแม่แบบเดิม) แล้วลงทะเบียนเฉพาะคำสั่งของเรา
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
  try {
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
  } catch (err) {
    if (err.code === 50001) {
      console.error('❌ Missing Access: บอทยังไม่ได้อยู่ในเซิร์ฟเวอร์ GUILD_ID นี้ หรือเชิญโดยไม่มี scope applications.commands\n' +
        '   → เชิญบอทใหม่ด้วยลิงก์ที่ติ๊ก bot + applications.commands และตรวจว่า GUILD_ID ถูกเซิร์ฟเวอร์');
    } else {
      console.error(err);
    }
  }
  console.log(`พร้อมใช้งานแล้ว: ${c.user.tag}`);

  // เริ่มซิงก์ชื่ออัตโนมัติ
  const mins = cfg.syncIntervalMinutes || 0;
  if (mins > 0) {
    setTimeout(syncNames, 60 * 1000);
    setInterval(syncNames, mins * 60 * 1000);
  }
});

// ---------- สมาชิกใหม่เข้าเซิร์ฟเวอร์: ให้ role "ยังไม่ยืนยัน" (ถ้าตั้งไว้) ----------
client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== process.env.GUILD_ID) return;
  if (cfg.unverifiedRoleId) await member.roles.add(cfg.unverifiedRoleId).catch(() => {});
});

// ---------- Panel ----------
function panelPayload() {
  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setTitle('✅ ยืนยันตัวตน')
    .setDescription(
      'กดปุ่มด้านล่างเพื่อส่งข้อมูลให้ผู้ตรวจสอบยืนยัน\n\n' +
      '1. กด 📝 **กรอกข้อมูลยืนยันตัวตน**\n' +
      '2. ใส่ **ชื่อผู้ใช้ Roblox** (ชื่อหลัง @ ไม่ใช่ชื่อที่แสดง)\n' +
      '3. แนบ **รูปในเกม** ที่เห็นชื่อบนหัวชัด ๆ (ได้สูงสุด 10 รูป)\n' +
      '4. รอผู้ตรวจสอบกดยืนยัน บอทจะเปลี่ยนชื่อให้เอง แล้วแจ้งผลทาง DM\n\n' +
      'ถ้าเปลี่ยนชื่อ Roblox ภายหลัง บอทจะอัพเดทชื่อให้อัตโนมัติ'
    )
    .setFooter({ text: 'ส่งคำขอได้ทีละ 1 อัน' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_form').setLabel('📝 กรอกข้อมูลยืนยันตัวตน').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setLabel('เข้าเกม').setStyle(ButtonStyle.Link).setURL(cfg.gameUrl),
  );
  return { embeds: [embed], components: [row] };
}

// ---------- Modal ----------
function buildModal() {
  const username = new TextInputBuilder()
    .setCustomId('username').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20);

  const proof = new FileUploadBuilder()
    .setCustomId('proof').setRequired(true).setMinValues(1).setMaxValues(10);

  return new ModalBuilder()
    .setCustomId('rank_form')
    .setTitle('อัพเดตยศ')
    .addLabelComponents(
      new LabelBuilder().setLabel('ชื่อผู้ใช้ Roblox').setDescription('ชื่อหลัง @ (ไม่ใช่ชื่อที่แสดง)').setTextInputComponent(username),
      new LabelBuilder().setLabel('รูปยืนยัน').setDescription('รูปในเกมที่เห็นชื่อและยศบนหัว ใส่ได้ 1 ถึง 10 รูป').setFileUploadComponent(proof),
    );
}

const isReviewer = (m) => cfg.reviewerRoleIds.some((id) => m.roles.cache.has(id)) ||
  m.permissions.has(PermissionFlagsBits.Administrator);

const pending = new Set(); // กันส่งซ้ำ

client.on(Events.InteractionCreate, async (i) => {
  try {
    // /setuprankpanel
    if (i.isChatInputCommand() && i.commandName === 'setuprankpanel') {
      await i.channel.send(panelPayload());
      return i.reply({ content: 'ส่งแผงเรียบร้อย ✅', flags: MessageFlags.Ephemeral });
    }

    // /announceupdate -> เปิดฟอร์มประกาศอัพเดท
    if (i.isChatInputCommand() && i.commandName === 'announceupdate') {
      const version = new TextInputBuilder()
        .setCustomId('version').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)
        .setValue(cfg.currentVersion || '');
      const details = new TextInputBuilder()
        .setCustomId('details').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(3500);
      return i.showModal(
        new ModalBuilder()
          .setCustomId('update_form')
          .setTitle('ประกาศอัพเดท')
          .addLabelComponents(
            new LabelBuilder().setLabel('เวอร์ชัน').setDescription('เช่น V0.1.67').setTextInputComponent(version),
            new LabelBuilder().setLabel('รายละเอียดอัพเดท').setDescription('พิมพ์ทีละบรรทัด 1 บรรทัด = 1 ข้อ').setTextInputComponent(details),
          ),
      );
    }

    // ส่งฟอร์มประกาศอัพเดท
    if (i.isModalSubmit() && i.customId === 'update_form') {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const version = i.fields.getTextInputValue('version').trim();
      const lines = i.fields.getTextInputValue('details').split('\n').map((l) => l.trim()).filter(Boolean)
        .map((l) => (/^[•\-\*\+]/.test(l) ? '• ' + l.replace(/^[•\-\*\+]\s*/, '') : '• ' + l));

      const embed = new EmbedBuilder()
        .setColor(cfg.color)
        .setTitle(`🆕 อัพเดท ${version}`)
        .setDescription(lines.join('\n').slice(0, 4000))
        .setFooter({ text: i.guild.name, iconURL: i.guild.iconURL() || undefined })
        .setTimestamp();
      const row = cfg.gameUrl
        ? new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('เข้าเกม').setStyle(ButtonStyle.Link).setURL(cfg.gameUrl))
        : null;

      const ch = cfg.updateChannelId ? await client.channels.fetch(cfg.updateChannelId) : i.channel;
      await ch.send({
        content: cfg.updatePingRoleId ? `<@&${cfg.updatePingRoleId}>` : undefined,
        embeds: [embed],
        components: row ? [row] : [],
      });
      return i.editReply(`✅ ประกาศอัพเดท ${version} แล้วที่ ${ch}`);
    }

    // /setupticketpanel
    if (i.isChatInputCommand() && i.commandName === 'setupticketpanel') {
      const embed = new EmbedBuilder()
        .setColor(cfg.color)
        .setTitle('🎫 ติดต่อแอดมิน')
        .setDescription('มีปัญหาหรือต้องการสอบถาม? กดปุ่มด้านล่างเพื่อเปิดห้องส่วนตัวคุยกับทีมงาน');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_open').setLabel('🎫 เปิดตั๋ว').setStyle(ButtonStyle.Primary),
      );
      await i.channel.send({ embeds: [embed], components: [row] });
      return i.reply({ content: 'ส่งแผงตั๋วเรียบร้อย ✅', flags: MessageFlags.Ephemeral });
    }

    // เปิดตั๋ว
    if (i.isButton() && i.customId === 'ticket_open') {
      const exist = i.guild.channels.cache.find((c) => c.topic === `ticket:${i.user.id}`);
      if (exist) return i.reply({ content: `คุณมีตั๋วที่เปิดอยู่แล้ว: ${exist}`, flags: MessageFlags.Ephemeral });

      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const staffRoles = cfg.ticketStaffRoleIds || cfg.reviewerRoleIds;
      const allow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles];
      const safe = i.user.username.toLowerCase().replace(/[^a-z0-9_-]/g, '') || i.user.id.slice(-6);
      const ch = await i.guild.channels.create({
        name: `ticket-${safe}`.slice(0, 90),
        type: ChannelType.GuildText,
        parent: cfg.ticketCategoryId || null,
        topic: `ticket:${i.user.id}`,
        permissionOverwrites: [
          { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: i.user.id, allow },
          { id: client.user.id, allow: [...allow, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks] },
          ...staffRoles.filter((id) => /^\d+$/.test(id) && id !== '000000000000000000').map((id) => ({ id, allow })),
        ],
      });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 ปิดตั๋ว').setStyle(ButtonStyle.Danger),
      );
      await ch.send({ content: `<@${i.user.id}> ทีมงานจะมาตอบเร็ว ๆ นี้ อธิบายปัญหาได้เลยครับ`, components: [row] });
      return i.editReply(`✅ เปิดตั๋วแล้ว: ${ch}`);
    }

    // ปิดตั๋ว
    if (i.isButton() && i.customId === 'ticket_close') {
      const ownerId = (i.channel.topic || '').replace('ticket:', '');
      if (i.user.id !== ownerId && !isReviewer(i.member)) {
        return i.reply({ content: 'คุณไม่มีสิทธิ์ปิดตั๋วนี้', flags: MessageFlags.Ephemeral });
      }
      await i.reply('🔒 กำลังปิดตั๋วใน 5 วินาที...');
      if (cfg.logChannelId) {
        const log = await client.channels.fetch(cfg.logChannelId).catch(() => null);
        log?.send(`🎫 ตั๋วของ <@${ownerId}> (#${i.channel.name}) ถูกปิดโดย <@${i.user.id}>`).catch(() => {});
      }
      setTimeout(() => i.channel.delete().catch(() => {}), 5000);
      return;
    }

    // เปิดฟอร์ม
    if (i.isButton() && i.customId === 'open_form') {
      if (pending.has(i.user.id)) {
        return i.reply({ content: 'คุณมีคำขอที่รอตรวจสอบอยู่แล้ว (ส่งได้ทีละ 1 อัน)', flags: MessageFlags.Ephemeral });
      }
      return i.showModal(buildModal());
    }

    // ส่งฟอร์ม
    if (i.isModalSubmit() && i.customId === 'rank_form') {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const name = i.fields.getTextInputValue('username').trim().replace(/^@/, '');
      const files = [...i.fields.getUploadedFiles('proof').values()];

      const rUser = await getRobloxUser(name);
      if (!rUser) return i.editReply('❌ ไม่พบชื่อผู้ใช้ Roblox นี้ ตรวจสอบตัวสะกดอีกครั้ง');

      const reqNo = nextRequestNo();
      const embed = new EmbedBuilder()
        .setColor(cfg.color)
        .setTitle(`📝 คำขอ #${reqNo}`)
        .addFields(
          { name: 'ผู้ขอ', value: `<@${i.user.id}>`, inline: true },
          { name: 'Roblox', value: `[${rUser.name}](https://www.roblox.com/users/${rUser.id}/profile)`, inline: true },
        )
        .setTimestamp();
      if (files[0]) embed.setImage(files[0].url);

      const extra = files.slice(1).map((f) => f.url).join('\n');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ok|${i.user.id}|${rUser.id}|${reqNo}`).setLabel('อนุมัติ').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`no|${i.user.id}`).setLabel('ปฏิเสธ').setStyle(ButtonStyle.Danger),
      );

      const ch = await client.channels.fetch(cfg.reviewChannelId);
      await ch.send({ embeds: [embed], components: [row], content: extra ? `รูปเพิ่มเติม:\n${extra}` : undefined });

      pending.add(i.user.id);
      return i.editReply('✅ ส่งคำขอแล้ว รอผู้ตรวจสอบยืนยัน ผลจะแจ้งทาง DM');
    }

    // อนุมัติ / ปฏิเสธ
    if (i.isButton() && (i.customId.startsWith('ok|') || i.customId.startsWith('no|'))) {
      if (!isReviewer(i.member)) {
        return i.reply({ content: 'คุณไม่มีสิทธิ์ตรวจสอบ', flags: MessageFlags.Ephemeral });
      }
      const [action, discordId, robloxId, reqNo] = i.customId.split('|');
      await i.deferUpdate();
      const member = await i.guild.members.fetch(discordId).catch(() => null);
      const finish = async (text) => {
        pending.delete(discordId);
        const e = EmbedBuilder.from(i.message.embeds[0]).setFooter({ text: `${text} โดย ${i.user.tag}` });
        await i.editReply({ embeds: [e], components: [] });
      };
      const dm = (msg) => member?.send(msg).catch(() => {});

      if (action === 'no') {
        await dm('❌ คำขออัพเดทยศของคุณถูกปฏิเสธ โปรดตรวจสอบรูปและข้อมูลแล้วส่งใหม่');
        return finish('ปฏิเสธ');
      }

      if (!member) return finish('ผู้ขอออกจากเซิร์ฟเวอร์แล้ว');

      // ดึงชื่อ Roblox ล่าสุดตอนอนุมัติ
      const res = await fetch(`https://users.roblox.com/v1/users/${robloxId}`).then((r) => r.json());
      const rName = res.name;

      // ผูกบัญชี (ใช้ซิงก์ชื่ออัตโนมัติภายหลัง)
      const data = loadData();
      data.links[discordId] = { robloxId: Number(robloxId), robloxName: rName };
      saveData(data);

      // ให้ role "ยืนยันแล้ว" และถอด role "ยังไม่ยืนยัน"
      if (cfg.verifiedRoleId) await member.roles.add(cfg.verifiedRoleId).catch(() => {});
      if (cfg.unverifiedRoleId) await member.roles.remove(cfg.unverifiedRoleId).catch(() => {});

      const nick = buildNick(member, rName);
      let nickOk = true;
      let nickWhy = '';
      await member.setNickname(nick).catch((e) => {
        nickOk = false;
        console.error('เปลี่ยนชื่อเล่นไม่ได้:', e.code, e.message);
        if (member.id === i.guild.ownerId) nickWhy = 'เป็นเจ้าของเซิร์ฟเวอร์ บอทเปลี่ยนชื่อให้ไม่ได้';
        else if (e.code === 50013) nickWhy = 'role บอทต่ำกว่า role ของคนนี้ หรือบอทไม่มีสิทธิ์ Manage Nicknames';
        else nickWhy = `error ${e.code || ''}`;
      });

      // การ์ดประกาศผล
      const avatar = await getRobloxAvatar(robloxId);
      const result = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ อัพเดทเรียบร้อย')
        .setDescription(`คำขอ **${reqNo ? '#' + reqNo : ''}** ได้รับการอนุมัติแล้ว ยินดีด้วย 🎉`)
        .addFields({ name: '🏷️ ชื่อใหม่', value: `\`${nick}\``, inline: true })
        .setFooter({ text: i.guild.name, iconURL: i.guild.iconURL() || undefined })
        .setTimestamp();
      if (avatar) result.setThumbnail(avatar);

      // ส่งการ์ดประกาศผลทาง DM
      const dmOk = await member.send({ embeds: [result] }).then(() => true).catch(() => false);

      const notes = [];
      if (!nickOk) notes.push(`เปลี่ยนชื่อไม่ได้: ${nickWhy}`);
      if (!dmOk) notes.push('ส่ง DM ไม่ได้ (ผู้ใช้ปิด DM)');
      return finish(notes.length ? `อนุมัติ (${notes.join(', ')})` : 'อนุมัติ');
    }
  } catch (err) {
    console.error(err);
    const msg = '⚠️ เกิดข้อผิดพลาด ลองใหม่อีกครั้งหรือแจ้งแอดมิน';
    if (i.deferred || i.replied) i.editReply(msg).catch(() => {});
    else i.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
});

// ---------- บอทแชท AI (บุคลิกตามที่ตั้งใน config.aiPersona) ----------
const aiHistory = []; // [{role:'user'|'model', text}] ประวัติสั้น ๆ ของห้องแชท
const aiCooldown = new Map(); // userId -> เวลาที่ส่งล่าสุด
const AI_KEEP = 12;

async function askAI(history) {
  const persona =
    `${cfg.aiPersona}\n\n` +
    'กฎ: ตอบสั้น เป็นกันเองเหมือนแชทในดิสคอร์ด ไม่เกิน 2-3 ประโยค ' +
    'ข้อความผู้ใช้จะขึ้นต้นด้วย "ชื่อ: " เพื่อบอกว่าใครพูด ห้ามขึ้นต้นคำตอบด้วยชื่อตัวเอง ' +
    'ถ้ามีคนถามว่าเป็นคนหรือบอท ให้ตอบตรง ๆ ว่าเป็นบอท AI ห้ามอ้างว่าเป็นคนจริง ๆ';

  // รวมข้อความ role เดียวกันที่ติดกัน (Gemini ชอบสลับ user/model)
  const contents = [];
  for (const h of history) {
    const last = contents[contents.length - 1];
    if (last && last.role === h.role) last.parts[0].text += '\n' + h.text;
    else contents.push({ role: h.role, parts: [{ text: h.text }] });
  }

  const model = cfg.aiModel || 'gemini-2.5-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: persona }] },
      contents,
      generationConfig: { maxOutputTokens: 300, temperature: 1 },
    }),
  });
  if (!res.ok) throw new Error(`AI API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim() || '';
}

client.on(Events.MessageCreate, async (msg) => {
  try {
    if (!cfg.aiChannelId || !process.env.GEMINI_API_KEY) return; // ปิดอยู่ถ้ายังไม่ตั้งค่า
    if (msg.author.bot || msg.channelId !== cfg.aiChannelId || !msg.content.trim()) return;

    const now = Date.now();
    if (now - (aiCooldown.get(msg.author.id) || 0) < 3000) return; // กันสแปม 3 วินาที
    aiCooldown.set(msg.author.id, now);

    const name = msg.member?.displayName || msg.author.username;
    aiHistory.push({ role: 'user', text: `${name}: ${msg.content.slice(0, 500)}` });
    while (aiHistory.length > AI_KEEP) aiHistory.shift();

    await msg.channel.sendTyping().catch(() => {});
    const answer = await askAI(aiHistory);
    if (!answer) return;

    aiHistory.push({ role: 'model', text: answer });
    while (aiHistory.length > AI_KEEP) aiHistory.shift();

    await msg.reply({ content: answer.slice(0, 1900), allowedMentions: { parse: [], repliedUser: false } });
  } catch (err) {
    console.error('AI chat error:', err.message);
  }
});

client.login(process.env.DISCORD_TOKEN);
