require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, FileUploadBuilder,
  SlashCommandBuilder, REST, Routes, PermissionFlagsBits, MessageFlags, Events,
} = require('discord.js');
const cfg = require('./config');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

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

// ---------- Commands ----------
const commands = [
  new SlashCommandBuilder()
    .setName('setup-rank-panel')
    .setDescription('ส่งแผงอัพเดทยศในห้องนี้')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((c) => c.toJSON());

client.once(Events.ClientReady, async (c) => {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
  console.log(`พร้อมใช้งานแล้ว: ${c.user.tag}`);
});

// ---------- Panel ----------
function panelPayload() {
  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setTitle('🎖️ อัพเดตยศในดิสคอร์ด')
    .setDescription(
      'ได้เลื่อนยศในเกมแล้ว? กดปุ่มด้านล่างเพื่อส่งข้อมูลให้ผู้ตรวจสอบยืนยัน\n\n' +
      '1. กด 📝 **กรอกข้อมูลอัพเดทยศ**\n' +
      '2. ใส่ **ชื่อผู้ใช้ Roblox** (ชื่อหลัง @ ไม่ใช่ชื่อที่แสดง)\n' +
      '3. แนบ **รูปในเกม** ที่เห็นชื่อและยศบนหัวชัด ๆ (ได้สูงสุด 10 รูป)\n' +
      '4. รอผู้ตรวจสอบกดยืนยัน บอทจะเปลี่ยนชื่อให้เอง แล้วแจ้งผลทาง DM'
    )
    .setFooter({ text: 'ส่งคำขอได้ทีละ 1 อัน' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_form').setLabel('📝 กรอกข้อมูลอัพเดทยศ').setStyle(ButtonStyle.Success),
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

      const nick = cfg.nicknameFormat.replace('{username}', rName).slice(0, 32);
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
