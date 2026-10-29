require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, FileUploadBuilder,
  SlashCommandBuilder, REST, Routes, PermissionFlagsBits, MessageFlags, Events, ChannelType,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// ---------- เก็บข้อมูลผูกบัญชี (Discord ↔ Roblox) ลงไฟล์ ----------
const DATA_FILE = path.join(__dirname, 'data.json');
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return { links: {} }; }
}
function saveData(d) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); } catch (e) { console.error('บันทึก data.json ไม่ได้', e); }
}

// สร้างชื่อเล่นตาม role ของสมาชิก
function buildNick(member, robloxName) {
  const special = (cfg.nicknameByRole || []).find((r) => member.roles.cache.has(r.roleId));
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
    .setName('setup-rank-panel')
    .setDescription('ส่งแผงอัพเดทยศในห้องนี้')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('setup-ticket-panel')
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

// ---------- สมาชิกใหม่เข้าเซิร์ฟเวอร์ ----------
client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== process.env.GUILD_ID) return;
  if (cfg.unverifiedRoleId) await member.roles.add(cfg.unverifiedRoleId).catch(() => {});
  if (cfg.welcomeChannelId) {
    const ch = await client.channels.fetch(cfg.welcomeChannelId).catch(() => null);
    if (ch) {
      const where = cfg.verifyChannelId ? ` ไปที่ <#${cfg.verifyChannelId}> แล้ว` : ' ';
      ch.send(`👋 ยินดีต้อนรับ <@${member.id}>!${where}กดปุ่ม **กรอกข้อมูล** เพื่อยืนยันตัวตนด้วยชื่อ Roblox`).catch(() => {});
    }
  }
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
    // /setup-rank-panel
    if (i.isChatInputCommand() && i.commandName === 'setup-rank-panel') {
      await i.channel.send(panelPayload());
      return i.reply({ content: 'ส่งแผงเรียบร้อย ✅', flags: MessageFlags.Ephemeral });
    }

    // /setup-ticket-panel
    if (i.isChatInputCommand() && i.commandName === 'setup-ticket-panel') {
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

      const embed = new EmbedBuilder()
        .setColor(cfg.color)
        .setTitle('📝 คำขออัพเดทยศ')
        .addFields(
          { name: 'ผู้ขอ', value: `<@${i.user.id}>`, inline: true },
          { name: 'Roblox', value: `[${rUser.name}](https://www.roblox.com/users/${rUser.id}/profile)`, inline: true },
        )
        .setTimestamp();
      if (files[0]) embed.setImage(files[0].url);

      const extra = files.slice(1).map((f) => f.url).join('\n');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ok|${i.user.id}|${rUser.id}`).setLabel('อนุมัติ').setStyle(ButtonStyle.Success),
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
      const [action, discordId, robloxId] = i.customId.split('|');
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
      await member.setNickname(nick).catch(() => { nickOk = false; });

      await dm(`✅ คำขออัพเดทของคุณได้รับการอนุมัติแล้ว!\nชื่อ: **${nick}**`);
      return finish(nickOk ? 'อนุมัติ' : 'อนุมัติ (เปลี่ยนชื่อไม่ได้ ต้องเปลี่ยนเอง)');
    }
  } catch (err) {
    console.error(err);
    const msg = '⚠️ เกิดข้อผิดพลาด ลองใหม่อีกครั้งหรือแจ้งแอดมิน';
    if (i.deferred || i.replied) i.editReply(msg).catch(() => {});
    else i.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
