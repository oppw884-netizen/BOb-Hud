require("dotenv").config();

const {
  Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes,
  MessageFlags, ContainerBuilder, SectionBuilder,
  TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  MediaGalleryBuilder, ActivityType,
} = require("discord.js");
const { Connectors, Shoukaku, LoadType } = require("shoukaku");
const {
  players, intervals, aloneTimers, queues,
  pausedStates, pausedElapsed, currentTracks, currentMsgs,
  startTimes, botVcIds, previousTracks, loopModes,
  volumeLevels, volumeSetBy,
} = require("./guildState");

/* ══════════════════════════════════════════════════
   ⚙️  ตั้งค่า — อ่านจากไฟล์ .env (ไม่ต้องแก้โค้ด)
   ══════════════════════════════════════════════════ */

const BOT_TOKEN = process.env.MUSIC_TOKEN || process.env.DISCORD_TOKEN;
if (!BOT_TOKEN) {
  console.warn("[Musicbot] ไม่พบ MUSIC_TOKEN — ข้ามการเปิดบอทเพลง (ใส่ MUSIC_TOKEN=โทเคนบอทเพลง ในไฟล์ .env)");
  return; // ออกจากโมดูลนี้เฉยๆ ไม่กระทบบอทหลักที่โหลดมันอยู่
}

const SUPPORT_URL = process.env.SUPPORT_URL || "https://discord.gg/aJCbu3r4fn";

// ALLOWED_GUILDS=id1,id2  (ว่าง = อนุญาตทุกเซิร์ฟเวอร์)
const ALLOWED_GUILDS = new Set(
  (process.env.ALLOWED_GUILDS || "").split(",").map(s => s.trim()).filter(Boolean)
);

// LOCKED_CHANNELS=guildId:channelId,guildId:channelId
const LOCKED_CHANNELS = {};
for (const pair of (process.env.LOCKED_CHANNELS || "").split(",")) {
  const [g, c] = pair.split(":").map(s => s && s.trim());
  if (g && c) LOCKED_CHANNELS[g] = c;
}

let LavalinkNodes = [
  { name: "SERENETIA", url: "lavalinkv4.serenetia.com:443",    auth: "https://seretia.link/discord", secure: true },
  { name: "JIRAYU",    url: "lavalink.jirayu.net:443",         auth: "youshallnotpass",              secure: true },
  { name: "TRINIUM",   url: "lavalink-v4.triniumhost.com:443", auth: "free",                         secure: true },
];
if (process.env.LAVALINK_NODES) {
  try { LavalinkNodes = JSON.parse(process.env.LAVALINK_NODES); }
  catch { console.warn("[Config] LAVALINK_NODES ไม่ใช่ JSON ที่ถูกต้อง ใช้ค่าเริ่มต้นแทน"); }
}

/* ══════════════════════════════════════════════════ */

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), LavalinkNodes, {
  resume: true,
  resumeTimeout: 60,
  reconnectTries: Infinity,
  reconnectInterval: 5000,
  restTimeout: 60000,
});

shoukaku.on("error",        (n, e) => console.error(`[Lavalink] ${n}:`, e?.message));
shoukaku.on("ready",        (n)    => console.log(`[Lavalink] ${n} ready`));
shoukaku.on("disconnect",   (n)    => console.warn(`[Lavalink] ${n} disconnected — reconnecting...`));
shoukaku.on("reconnecting", (n)    => console.log(`[Lavalink] ${n} reconnecting...`));

/* ─── กันบอทล้มเพราะ error ที่ไม่ได้ดักไว้ (โฮสต์จะไม่รีสตาร์ทให้ถ้าล้มถี่) ─── */
process.on("unhandledRejection", (e) => console.error("[Unhandled rejection]", e));
process.on("uncaughtException",  (e) => console.error("[Uncaught exception]", e));
client.on("error", (e) => console.error("[Discord client]", e));

/* ─── helpers ─── */
const supportBtn = () => new ButtonBuilder().setURL(SUPPORT_URL).setLabel("Discord Support").setStyle(ButtonStyle.Link);

// ข้อความเฉพาะตัว (ephemeral) แบบ Components V2
function v2(text, color = 0xe74c3c, ephemeral = true) {
  return {
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
    components: [new ContainerBuilder().setAccentColor(color).addTextDisplayComponents(t => t.setContent(text))],
  };
}

function isGuildAllowed(gid) {
  if (ALLOWED_GUILDS.size === 0) return true;
  return ALLOWED_GUILDS.has(gid);
}

function notAllowedReply() {
  return {
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [
      new ContainerBuilder()
        .setAccentColor(0xe74c3c)
        .addTextDisplayComponents(t => t.setContent(
          "## ❌ ไม่ได้รับอนุญาต\n" +
          "**เซิร์ฟเวอร์ของคุณไม่ได้รับอนุญาตให้ใช้บอท‼️**\n" +
          "-# กรุณาติดต่อเจ้าของบอทเพื่อขอสิทธิ์"
        ))
        .addActionRowComponents(new ActionRowBuilder().addComponents(supportBtn())),
    ],
  };
}

// เช็กว่าผู้ใช้อยู่ห้องเดียวกับบอท
function inBotVc(interaction, gid) {
  const userVcId = interaction.member?.voice?.channelId;
  const botVcId = botVcIds.get(gid);
  return !!userVcId && userVcId === botVcId;
}
const NEED_SAME_VC = "❌ **คุณต้องอยู่ในห้องเสียงเดียวกับบอทก่อน**";
const NOT_PLAYING  = "❌ **บอทไม่ได้เล่นเพลงอยู่**";

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
function bar(cur, tot, len = 16) {
  if (!tot) return "░".repeat(len);
  const f = Math.round(Math.min(cur / tot, 1) * len);
  return "▓".repeat(f) + "░".repeat(len - f);
}
function elapsedOf(gid) {
  return pausedStates.get(gid)
    ? (pausedElapsed.get(gid) || 0)
    : Date.now() - (startTimes.get(gid) || Date.now());
}

/* ─── ปุ่มและข้อความ "กำลังเล่น" ─── */
function nowPlaying(track, elapsed, paused = false, loopMode = "none") {
  const title = track.info?.title      || "ไม่ทราบชื่อเพลง";
  const auth  = track.info?.author     || "";
  const total = track.info?.length     || 0;
  const art   = track.info?.artworkUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
  const uri   = track.info?.uri        || "";

  const header = paused ? "## ⏸ หยุดชั่วคราว" : "## 🎵 กำลังเล่นอยู่";
  const loopLabel = loopMode === "track" ? "  🔂 วนซ้ำเพลงนี้" : loopMode === "queue" ? "  🔁 วนซ้ำทั้งคิว" : "";

  const section = new SectionBuilder()
    .addTextDisplayComponents(t => t.setContent(`${header}\n**${title}**\n-# 👤 ${auth}${loopLabel}`))
    .setThumbnailAccessory(th => th.setURL(art).setDescription(title));

  const sep = new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

  const prog = new TextDisplayBuilder().setContent(
    `\`${bar(elapsed, total)}\`\n⏱️ **${fmt(elapsed)}** / **${fmt(total)}**  •  เหลืออีก **${fmt(Math.max(total - elapsed, 0))}**${uri ? `\n-# 🔗 ${uri}` : ""}`
  );

  const pauseBtn = paused
    ? new ButtonBuilder().setCustomId("music_pause").setLabel("▶ เล่นเพลงต่อ").setStyle(ButtonStyle.Success)
    : new ButtonBuilder().setCustomId("music_pause").setLabel("⏸ หยุดเพลง").setStyle(ButtonStyle.Danger);

  const loopBtn = loopMode === "none"
    ? new ButtonBuilder().setCustomId("music_loop").setLabel("🔁 วนซ้ำ").setStyle(ButtonStyle.Secondary)
    : new ButtonBuilder().setCustomId("music_loop").setLabel(loopMode === "track" ? "🔂 วนซ้ำอยู่" : "🔁 วนซ้ำอยู่").setStyle(ButtonStyle.Success);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("music_prev").setLabel("⏮ ก่อนหน้า").setStyle(ButtonStyle.Secondary),
    pauseBtn,
    new ButtonBuilder().setCustomId("music_skip").setLabel("⏭ ข้าม").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("music_queue").setLabel("📋 คิว").setStyle(ButtonStyle.Secondary),
    loopBtn,
  );

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      new ContainerBuilder()
        .setAccentColor(paused ? 0xe67e22 : 0x9b59b6)
        .addSectionComponents(section)
        .addSeparatorComponents(sep)
        .addTextDisplayComponents(prog)
        .addActionRowComponents(buttons)
        .addActionRowComponents(new ActionRowBuilder().addComponents(supportBtn())),
    ],
  };
}

/* ══════════════════════════════════════════════════
   🔒  ระบบห้องล็อก (Home Channel)
   ══════════════════════════════════════════════════ */

async function joinLockedChannel(gid) {
  const lockedId = LOCKED_CHANNELS[gid];
  if (!lockedId) return false;
  if (!client.guilds.cache.get(gid)) return false;

  try {
    const player = await shoukaku.joinVoiceChannel({ guildId: gid, channelId: lockedId, shardId: 0 });
    players.set(gid, player);
    botVcIds.set(gid, lockedId);
    player.on("end", () => {});
    player.on("error", () => {});
    console.log(`[LockedVC] joined home channel ${lockedId} in guild ${gid}`);
    return true;
  } catch (e) {
    console.error(`[LockedVC] failed to join ${lockedId} in guild ${gid}:`, e?.message);
    return false;
  }
}

// ปล่อย player เดิมทิ้งอย่างปลอดภัย (ไม่ให้ยิง playNext ซ้ำ)
async function dropPlayer(gid) {
  const player = players.get(gid);
  if (player) {
    try { player.removeAllListeners("end"); player.removeAllListeners("error"); } catch {}
    try { await player.stopTrack(); } catch {}
    players.delete(gid);
  }
  try { await shoukaku.leaveVoiceChannel(gid); } catch {}
  botVcIds.delete(gid);
}

async function returnToLockedOrLeave(gid) {
  clearTimeout(aloneTimers.get(gid));
  aloneTimers.delete(gid);
  stopInterval(gid);
  queues.delete(gid);
  pausedStates.delete(gid);
  pausedElapsed.delete(gid);
  currentTracks.delete(gid);
  currentMsgs.delete(gid);
  startTimes.delete(gid);
  loopModes.delete(gid);
  volumeLevels.delete(gid);
  volumeSetBy.delete(gid);

  await dropPlayer(gid);

  if (LOCKED_CHANNELS[gid]) {
    await new Promise(r => setTimeout(r, 1500));
    await joinLockedChannel(gid);
  } else {
    console.log("[Voice] left channel in guild", gid);
  }
}

const leaveVoice = (gid) => returnToLockedOrLeave(gid);

/* ─── ตรวจทุก 15 วินาที: ถ้าไม่ได้เล่นเพลงและไม่อยู่ห้องล็อก → กลับเข้าห้องล็อก ─── */
setInterval(async () => {
  for (const [gid, lockedId] of Object.entries(LOCKED_CHANNELS)) {
    try {
      if (currentTracks.has(gid)) continue;
      if (!client.guilds.cache.get(gid)) continue;
      if (botVcIds.get(gid) !== lockedId) {
        console.log(`[LockedVC] not in home channel, rejoining... (guild ${gid})`);
        await dropPlayer(gid);
        await new Promise(r => setTimeout(r, 500));
        await joinLockedChannel(gid);
      }
    } catch (e) { console.error("[LockedVC loop]", e?.message); }
  }
}, 15_000);

/* ─── อัปเดตแถบเวลา ─── */
function stopInterval(gid) { clearInterval(intervals.get(gid)); intervals.delete(gid); }

function startInterval(gid, track, t0, msg, channel) {
  stopInterval(gid);
  const old = currentTracks.get(gid);
  // บันทึกเพลงก่อนหน้า เฉพาะเมื่อเป็นเพลงคนละเพลงกับที่กำลังจะเล่น
  if (old && old.encoded !== track.encoded) {
    previousTracks.set(gid, { track: old, channel: currentMsgs.get(gid)?.channel || channel });
  }
  currentTracks.set(gid, track);
  currentMsgs.set(gid, msg);
  startTimes.set(gid, t0);
  const total = track.info?.length || 0;
  intervals.set(gid, setInterval(async () => {
    if (pausedStates.get(gid)) return;
    const el = Date.now() - t0;
    if (total > 0 && el >= total + 10_000) { stopInterval(gid); return; }
    try { await msg.edit(nowPlaying(track, el, false, loopModes.get(gid) || "none")); }
    catch (e) { console.warn("[Interval] edit failed (non-fatal):", e?.message); }
  }, 10_000));
}

/* ─── เล่นเพลงถัดไปในคิว ─── */
async function playNext(gid) {
  pausedStates.delete(gid);
  pausedElapsed.delete(gid);

  const old   = currentTracks.get(gid);
  const oldCh = currentMsgs.get(gid)?.channel;
  if (old) previousTracks.set(gid, { track: old, channel: oldCh });

  const loop   = loopModes.get(gid) || "none";
  const player = players.get(gid);
  if (!player) { await returnToLockedOrLeave(gid); return; }

  if (volumeLevels.has(gid)) {
    try { await player.setGlobalVolume(100); } catch {}
    volumeLevels.delete(gid);
    volumeSetBy.delete(gid);
  }

  async function editOrSend(ch, payload) {
    const existing = currentMsgs.get(gid);
    if (existing) { try { return await existing.edit(payload); } catch {} }
    return ch ? await ch.send(payload) : null;
  }

  if (loop === "track" && old) {
    try {
      await player.playTrack({ track: { encoded: old.encoded } });
      const t0 = Date.now();
      const msg = await editOrSend(oldCh, nowPlaying(old, 0, false, "track"));
      if (msg) startInterval(gid, old, t0, msg, oldCh);
    } catch (e) { console.error("[Loop-track] error:", e?.message); await returnToLockedOrLeave(gid); }
    return;
  }

  const queue = queues.get(gid) || [];
  if (loop === "queue" && old) queue.push({ track: old, channel: oldCh });

  if (queue.length === 0) {
    currentTracks.delete(gid);
    currentMsgs.delete(gid);
    startTimes.delete(gid);
    stopInterval(gid);
    await returnToLockedOrLeave(gid);
    return;
  }

  const next = queue.shift();
  queues.set(gid, queue);
  try {
    await player.playTrack({ track: { encoded: next.track.encoded } });
    console.log("[Queue] playing next:", next.track.info?.title);
    const ch = next.channel || oldCh;
    const t0 = Date.now();
    const msg = await editOrSend(ch, nowPlaying(next.track, 0, false, loop));
    if (msg) startInterval(gid, next.track, t0, msg, ch);
  } catch (e) {
    console.error("[Queue] playNext error:", e?.message);
    await returnToLockedOrLeave(gid);
  }
}

/* ─── ลงทะเบียน slash commands ─── */
async function register() {
  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
  await rest.put(Routes.applicationCommands(client.application.id), {
    body: [
      new SlashCommandBuilder()
        .setName("play").setDescription("[⭐️] เปิดเพลง / เพิ่มเพลงเข้าคิว")
        .addStringOption(o => o.setName("query").setDescription("ลิ้งหรือชื่อเพลง").setRequired(true))
        .toJSON(),
      new SlashCommandBuilder().setName("leave").setDescription("[⭐️] หยุดเล่นเพลงและออกห้องเสียง").toJSON(),
      new SlashCommandBuilder().setName("skip").setDescription("[⭐️] ข้ามไปเพลงถัดไป").toJSON(),
      new SlashCommandBuilder().setName("nodes").setDescription("[⭐️] สถานะของเครื่องเปิดเพลง").toJSON(),
      new SlashCommandBuilder().setName("volume").setDescription("[⭐️] ปรับระดับเสียงบอท").toJSON(),
      new SlashCommandBuilder().setName("clear").setDescription("[⭐️] ล้างคิวเพลงทั้งหมด").toJSON(),
      new SlashCommandBuilder().setName("pause").setDescription("[⭐️] หยุดเพลง").toJSON(),
      new SlashCommandBuilder().setName("resume").setDescription("[⭐️] เล่นเพลงต่อ").toJSON(),
      new SlashCommandBuilder().setName("queue").setDescription("[⭐️] แสดงคิวเพลงทั้งหมด").toJSON(),
      new SlashCommandBuilder().setName("nowplaying").setDescription("[⭐️] ดูเพลงที่กำลังเล่นอยู่").toJSON(),
      new SlashCommandBuilder().setName("previous").setDescription("[⭐️] เล่นเพลงก่อนหน้านี้").toJSON(),
      new SlashCommandBuilder()
        .setName("loop").setDescription("[⭐️] วนลูปเพลง")
        .addStringOption(o => o.setName("type").setDescription("เลือกใช้งานวนลูป").setRequired(true)
          .addChoices(
            { name: "Loop song - วนลูปเพลงที่กำลังเล่นอยู่", value: "track" },
            { name: "Loop queue - วนลูปเพลงในคิวทั้งหมด",    value: "queue" },
            { name: "Loop none - ปิดใช้งานวนลูป",             value: "none"  },
          ))
        .toJSON(),
    ],
  });
  console.log("[Bot] slash commands registered");
}

function updatePresence() {
  const guildCount = client.guilds.cache.size;
  const userCount  = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
  client.user.setPresence({
    status: "online",
    activities: [{ name: `${guildCount} เซิร์ฟเวอร์ | ${userCount} คน`, type: ActivityType.Watching }],
  });
}

/* ─── events ─── */
client.once("clientReady", async () => {
  console.log(`[Bot] online: ${client.user.tag}`);
  try { await register(); } catch (e) { console.error("[Bot] register failed:", e?.message); }
  updatePresence();
  setInterval(updatePresence, 5 * 60_000);

  // รอ Lavalink พร้อมก่อนเข้าห้องล็อก
  setTimeout(async () => {
    for (const gid of Object.keys(LOCKED_CHANNELS)) {
      if (!client.guilds.cache.has(gid)) continue;
      await joinLockedChannel(gid);
      await new Promise(r => setTimeout(r, 500));
    }
  }, 5000);
});

client.on("guildCreate", () => updatePresence());
client.on("guildDelete", () => updatePresence());

/* ─── voiceStateUpdate ─── */
client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    const gid = oldState.guild.id;

    // บอทถูกย้าย/เตะออก → กลับห้องล็อก
    if (oldState.member?.id === client.user.id) {
      const lockedId = LOCKED_CHANNELS[gid];
      if (!lockedId) return;
      if (currentTracks.has(gid)) return;

      if (oldState.channel && (!newState.channel || newState.channel.id !== lockedId)) {
        console.log(`[LockedVC] bot was moved/kicked in guild ${gid}, rejoining...`);
        await new Promise(r => setTimeout(r, 2000));
        await dropPlayer(gid);
        await new Promise(r => setTimeout(r, 500));
        await joinLockedChannel(gid);
      }
      return;
    }

    // คนออกห้องขณะบอทเล่นเพลง
    if (!players.has(gid) || !currentTracks.has(gid)) return;

    const botVoice = oldState.guild.members.me?.voice?.channel;
    if (!botVoice) return;
    if (LOCKED_CHANNELS[gid] && botVoice.id === LOCKED_CHANNELS[gid]) return;

    const nonBotMembers = botVoice.members.filter(m => !m.user.bot);
    if (nonBotMembers.size === 0) {
      if (!aloneTimers.has(gid)) {
        console.log("[Voice] บอทอยู่คนเดียว เริ่มนับ 5 วิ...");
        aloneTimers.set(gid, setTimeout(() => {
          console.log("[Voice] หมดเวลา 5 วิ บอทออก/กลับห้องล็อก");
          leaveVoice(gid).catch(e => console.error("[leaveVoice]", e?.message));
        }, 5000));
      }
    } else if (aloneTimers.has(gid)) {
      clearTimeout(aloneTimers.get(gid));
      aloneTimers.delete(gid);
    }

    // รีเซ็ตเสียงถ้าคนที่ปรับออกห้อง
    const leftUserId = oldState.member?.id;
    if (leftUserId && volumeSetBy.get(gid) === leftUserId) {
      const newCh = newState.channelId;
      if (!newCh || newCh !== botVcIds.get(gid)) {
        const player = players.get(gid);
        if (player) { try { await player.setGlobalVolume(100); } catch {} }
        volumeLevels.delete(gid);
        volumeSetBy.delete(gid);
      }
    }
  } catch (e) { console.error("[voiceStateUpdate]", e?.message); }
});

/* ══════════════════════════════════════════════════
   🎮  Interactions
   ══════════════════════════════════════════════════ */
client.on("interactionCreate", async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (e) {
    console.error("[Interaction]", e);
    try {
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: "❌ เกิดข้อผิดพลาดภายในบอท", ephemeral: true });
      else await interaction.reply({ content: "❌ เกิดข้อผิดพลาดภายในบอท", ephemeral: true });
    } catch {}
  }
});

async function handleInteraction(interaction) {

  /* ════ Modal: ระดับเสียง ════ */
  if (interaction.isModalSubmit() && interaction.customId === "volume_modal") {
    if (!isGuildAllowed(interaction.guildId)) return interaction.reply(notAllowedReply());
    const gid = interaction.guildId;
    const player = players.get(gid);
    const vol = parseInt(interaction.fields.getTextInputValue("volume_input").trim(), 10);
    if (isNaN(vol) || vol < 0 || vol > 100) return interaction.reply(v2("❌ **ระดับเสียงไม่ถูกต้อง**\nกรอกตัวเลข 0 – 100 เท่านั้น"));
    if (!player) return interaction.reply(v2(NOT_PLAYING));
    try {
      await player.setGlobalVolume(vol);
      volumeLevels.set(gid, vol);
      volumeSetBy.set(gid, interaction.user.id);
      const b = "▓".repeat(Math.round(vol / 10)) + "░".repeat(10 - Math.round(vol / 10));
      return interaction.reply(v2(`## 🔊 ปรับระดับเสียงแล้ว\n\`${b}\` **${vol}%**\n-# จะรีเซ็ตกลับ 100% เมื่อเพลงถัดไปเริ่ม หรือเมื่อคุณออกห้องเสียง`, 0x2ecc71, false));
    } catch (e) {
      return interaction.reply({ content: "❌ ปรับระดับเสียงไม่สำเร็จ: " + e.message, ephemeral: true });
    }
  }

  /* ════ Buttons ════ */
  if (interaction.isButton()) {
    const gid = interaction.guildId;
    if (!isGuildAllowed(gid)) return interaction.reply(notAllowedReply());

    const player = players.get(gid);
    const userVcId = interaction.member?.voice?.channelId;
    const botVcId = botVcIds.get(gid);
    if (botVcId && userVcId !== botVcId) {
      return interaction.reply(v2("❌ **ไม่สามารถใช้ปุ่มนี้ได้**\nคุณต้องเข้าห้องเสียงเดียวกับบอทก่อนถึงจะใช้งานได้"));
    }

    /* หยุด / เล่นต่อ */
    if (interaction.customId === "music_pause") {
      if (!player) return interaction.reply({ content: "❌ ไม่มีเพลงที่กำลังเล่นอยู่", ephemeral: true });
      const isPaused = pausedStates.get(gid) || false;
      if (!isPaused) {
        const elapsed = Date.now() - (startTimes.get(gid) || Date.now());
        pausedElapsed.set(gid, elapsed); pausedStates.set(gid, true); stopInterval(gid);
        try { await player.setPaused(true); } catch {}
        const track = currentTracks.get(gid);
        if (track) await interaction.update(nowPlaying(track, elapsed, true, loopModes.get(gid) || "none")).catch(() => {});
        else await interaction.deferUpdate().catch(() => {});
      } else {
        const elapsed = pausedElapsed.get(gid) || 0;
        const newT0 = Date.now() - elapsed;
        pausedStates.set(gid, false); pausedElapsed.delete(gid);
        try { await player.setPaused(false); } catch {}
        const track = currentTracks.get(gid); const msg = currentMsgs.get(gid);
        if (track && msg) {
          startInterval(gid, track, newT0, msg);
          await interaction.update(nowPlaying(track, elapsed, false, loopModes.get(gid) || "none")).catch(() => {});
        } else await interaction.deferUpdate().catch(() => {});
      }
      return;
    }

    /* ข้ามเพลง */
    if (interaction.customId === "music_skip") {
      if (!player) return interaction.reply({ content: "❌ ไม่มีเพลงที่กำลังเล่นอยู่", ephemeral: true });
      const queue = queues.get(gid) || [];
      const loop = loopModes.get(gid) || "none";
      if (queue.length === 0 && loop === "none") return interaction.reply(v2("❌ **ไม่สามารถข้ามเพลงได้**\nเนื่องจากไม่มีคิวเพลงถัดไป"));
      await interaction.deferUpdate();
      stopInterval(gid);
      await interaction.editReply(v2("⏭ **ข้ามเพลงแล้ว**", 0x3498db, false)).catch(() => {});
      try { await player.stopTrack(); } catch {}
      return;
    }

    /* เพลงก่อนหน้า */
    if (interaction.customId === "music_prev") {
      if (!player) return interaction.reply({ content: "❌ ไม่มีเพลงที่กำลังเล่นอยู่", ephemeral: true });
      const prev = previousTracks.get(gid);
      if (!prev) return interaction.reply(v2("❌ **ไม่มีเพลงก่อนหน้า**\nยังไม่มีประวัติเพลงที่จบไปแล้ว"));
      await interaction.deferUpdate(); stopInterval(gid); pausedStates.delete(gid); pausedElapsed.delete(gid);
      try {
        await player.playTrack({ track: { encoded: prev.track.encoded } });
        const t0 = Date.now();
        const msg = await interaction.editReply(nowPlaying(prev.track, 0, false, loopModes.get(gid) || "none"));
        startInterval(gid, prev.track, t0, msg, prev.channel || interaction.channel);
      } catch { await interaction.editReply({ content: "❌ เกิดข้อผิดพลาดขณะเล่นเพลงก่อนหน้า" }).catch(() => {}); }
      return;
    }

    /* ดูคิว */
    if (interaction.customId === "music_queue") {
      const queue = queues.get(gid) || [];
      const content = queue.length === 0
        ? "## 📋 คิวเพลง\nไม่มีเพลงในคิวตอนนี้"
        : `## 📋 คิวเพลง (${queue.length} เพลง)\n` + queue.slice(0, 20).map((item, i) => `**${i + 1}.** ${item.track.info?.title || "ไม่ทราบชื่อ"}  \`${item.track.info?.length ? fmt(item.track.info.length) : "--:--"}\``).join("\n") + (queue.length > 20 ? `\n-# และอีก ${queue.length - 20} เพลง` : "");
      return interaction.reply(v2(content, 0x9b59b6));
    }

    /* เมนูวนซ้ำ */
    if (interaction.customId === "music_loop") {
      const cur = loopModes.get(gid) || "none";
      const curText = cur === "track" ? "🔂 วนซ้ำเพลงนี้" : cur === "queue" ? "🔁 วนซ้ำทั้งคิว" : "ปิด";
      return interaction.reply({
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [new ContainerBuilder().setAccentColor(0xf1c40f)
          .addTextDisplayComponents(t => t.setContent(`## 🔁 ต้องการวนซ้ำแบบไหน?\n-# โหมดปัจจุบัน: **${curText}**`))
          .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("music_loop_track").setLabel("🔂 วนซ้ำเพลงที่กำลังเล่น").setStyle(cur === "track" ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("music_loop_queue").setLabel("🔁 วนซ้ำเพลงในคิวทั้งหมด").setStyle(cur === "queue" ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("music_loop_off").setLabel("⛔ เลิกวนซ้ำ").setStyle(cur === "none" ? ButtonStyle.Danger : ButtonStyle.Secondary),
            supportBtn(),
          ))],
      });
    }

    /* ตั้งโหมดวนซ้ำ */
    if (["music_loop_track", "music_loop_queue", "music_loop_off"].includes(interaction.customId)) {
      const modeMap = { music_loop_track: "track", music_loop_queue: "queue", music_loop_off: "none" };
      const newMode = modeMap[interaction.customId];
      loopModes.set(gid, newMode);
      const label = newMode === "track" ? "🔂 วนซ้ำเพลงที่กำลังเล่นอยู่" : newMode === "queue" ? "🔁 วนซ้ำเพลงในคิวทั้งหมด" : "⛔ เลิกวนซ้ำแล้ว";
      const color = newMode === "track" ? 0xf1c40f : newMode === "queue" ? 0x2ecc71 : 0xe74c3c;
      const nowMsg = currentMsgs.get(gid); const nowTrack = currentTracks.get(gid);
      if (nowMsg && nowTrack) await nowMsg.edit(nowPlaying(nowTrack, elapsedOf(gid), pausedStates.get(gid) || false, newMode)).catch(() => {});
      return interaction.update(v2(`## ✅ ตั้งค่าแล้ว\n${label}`, color));
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const gid = interaction.guildId;
  if (!gid) return interaction.reply({ content: "ใช้คำสั่งนี้ได้เฉพาะในเซิร์ฟเวอร์", ephemeral: true });
  if (!isGuildAllowed(gid)) return interaction.reply(notAllowedReply());

  const name = interaction.commandName;

  /* ════ /leave ════ */
  if (name === "leave") {
    if (!players.has(gid) || !currentTracks.has(gid)) return interaction.reply(v2(NOT_PLAYING));
    if (!inBotVc(interaction, gid)) return interaction.reply(v2(NEED_SAME_VC));
    const hasLocked = !!LOCKED_CHANNELS[gid];
    await interaction.reply(v2(
      hasLocked ? "👋 **หยุดเล่นเพลงแล้ว**\nล้างคิวเรียบร้อย — บอทกลับห้องล็อกแล้ว 🔒" : "👋 **ออกจากห้องเสียงแล้ว**\nหยุดเล่นเพลงและล้างคิวเรียบร้อย",
      0x2ecc71, false
    ));
    await leaveVoice(gid);
    return;
  }

  /* ════ /skip ════ */
  if (name === "skip") {
    const player = players.get(gid);
    if (!player || !currentTracks.has(gid)) return interaction.reply(v2("❌ **ไม่มีเพลงที่กำลังเล่นอยู่**"));
    if (!inBotVc(interaction, gid)) return interaction.reply(v2(NEED_SAME_VC));
    const queue = queues.get(gid) || []; const loop = loopModes.get(gid) || "none";
    if (queue.length === 0 && loop === "none") return interaction.reply(v2("❌ **ไม่มีเพลงถัดไปในคิว**"));
    await interaction.reply(v2("⏭ **ข้ามเพลงแล้ว**", 0x3498db, false));
    stopInterval(gid); try { await player.stopTrack(); } catch {}
    return;
  }

  /* ════ /nodes ════ */
  if (name === "nodes") {
    const fmtUptime = (ms) => { const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return `${d}d ${h}h ${m}m`; };
    const fmtBytes = (b) => b >= 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : (b / 1024).toFixed(1) + " KB";
    const nodeList = [...shoukaku.nodes.values()];
    if (!nodeList.length) return interaction.reply(v2("❌ **ไม่มี Lavalink node**"));
    const lines = nodeList.map(node => {
      const dot = node.state === 1 ? "🟢" : "🔴"; const st = node.stats;
      if (!st) return `${dot} **${node.name}**\n└ ไม่มีข้อมูล`;
      return [
        `${dot} **${node.name}**`,
        `└ กำลังเล่น: **${st.playingPlayers ?? 0} ห้อง**`,
        `└ ซีพียู: **${((st.cpu?.systemLoad || 0) * 100).toFixed(1)}%**`,
        `└ แรม: **${fmtBytes(st.memory?.used || 0)}**`,
        `└ ทำงาน: **${fmtUptime(st.uptime || 0)}**`,
      ].join("\n");
    }).join("\n\n");
    return interaction.reply({
      flags: MessageFlags.IsComponentsV2,
      components: [new ContainerBuilder().setAccentColor(0x9b59b6)
        .addTextDisplayComponents(t => t.setContent(`## 🖥️ สถานะของเครื่องเปิดเพลง\n${lines}`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t => t.setContent(`-# Powered by cat_mc159 • ${nodeList.length} node`))
        .addActionRowComponents(new ActionRowBuilder().addComponents(supportBtn()))],
    });
  }

  /* ════ /pause ════ */
  if (name === "pause") {
    const player = players.get(gid);
    if (!player || !currentTracks.has(gid)) return interaction.reply(v2(NOT_PLAYING));
    if (!inBotVc(interaction, gid)) return interaction.reply(v2(NEED_SAME_VC));
    if (pausedStates.get(gid)) return interaction.reply(v2("⏸ **เพลงหยุดอยู่แล้ว**", 0xe67e22));
    const elapsed = Date.now() - (startTimes.get(gid) || Date.now());
    pausedElapsed.set(gid, elapsed); pausedStates.set(gid, true); stopInterval(gid);
    try { await player.setPaused(true); } catch {}
    const track = currentTracks.get(gid); const nowMsg = currentMsgs.get(gid);
    if (track && nowMsg) await nowMsg.edit(nowPlaying(track, elapsed, true, loopModes.get(gid) || "none")).catch(() => {});
    return interaction.reply(v2("⏸ **หยุดเพลงแล้ว**", 0xe67e22, false));
  }

  /* ════ /resume ════ */
  if (name === "resume") {
    const player = players.get(gid);
    if (!player || !currentTracks.has(gid)) return interaction.reply(v2(NOT_PLAYING));
    if (!inBotVc(interaction, gid)) return interaction.reply(v2(NEED_SAME_VC));
    if (!pausedStates.get(gid)) return interaction.reply(v2("▶ **เพลงกำลังเล่นอยู่แล้ว**", 0xe67e22));
    const elapsed = pausedElapsed.get(gid) || 0; const newT0 = Date.now() - elapsed;
    pausedStates.set(gid, false); pausedElapsed.delete(gid);
    try { await player.setPaused(false); } catch {}
    const track = currentTracks.get(gid); const nowMsg = currentMsgs.get(gid);
    if (track && nowMsg) {
      startInterval(gid, track, newT0, nowMsg);
      await nowMsg.edit(nowPlaying(track, elapsed, false, loopModes.get(gid) || "none")).catch(() => {});
    }
    return interaction.reply(v2("▶ **เล่นเพลงต่อแล้ว**", 0x2ecc71, false));
  }

  /* ════ /clear ════ */
  if (name === "clear") {
    if (!players.has(gid)) return interaction.reply(v2("❌ **บอทไม่ได้อยู่ในห้องเสียง**"));
    if (!inBotVc(interaction, gid)) return interaction.reply(v2(NEED_SAME_VC));
    const count = (queues.get(gid) || []).length;
    if (count === 0) return interaction.reply(v2("📋 **คิวว่างเปล่าอยู่แล้ว**", 0xe67e22));
    queues.set(gid, []);
    return interaction.reply(v2(`🗑️ **ล้างคิวเรียบร้อย**\nลบออกทั้งหมด **${count} เพลง**`, 0x2ecc71, false));
  }

  /* ════ /volume ════ */
  if (name === "volume") {
    if (!players.has(gid) || !currentTracks.has(gid)) return interaction.reply(v2(NOT_PLAYING));
    if (!inBotVc(interaction, gid)) return interaction.reply(v2(NEED_SAME_VC));
    const cur = volumeLevels.get(gid) ?? 100;
    return interaction.showModal(new ModalBuilder().setCustomId("volume_modal").setTitle("🔊 ปรับระดับเสียง").addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("volume_input")
          .setLabel(`ระดับเสียง (0 – 100) | ปัจจุบัน: ${cur}%`)
          .setStyle(TextInputStyle.Short).setPlaceholder("กรอกตัวเลข 0 ถึง 100")
          .setRequired(true).setMinLength(1).setMaxLength(3)
      )
    ));
  }

  /* ════ /loop ════ */
  if (name === "loop") {
    if (!players.has(gid)) return interaction.reply(v2("❌ **บอทไม่ได้อยู่ในห้องเสียง**"));
    if (!inBotVc(interaction, gid)) return interaction.reply(v2(NEED_SAME_VC));
    const type = interaction.options.getString("type");
    loopModes.set(gid, type);
    const labelMap = { track: "🔂 วนซ้ำเพลงที่กำลังเล่นอยู่", queue: "🔁 วนซ้ำเพลงในคิวทั้งหมด", none: "⛔ ปิดใช้งานวนลูปแล้ว" };
    const colorMap = { track: 0x2ecc71, queue: 0x2ecc71, none: 0x95a5a6 };
    const current = currentTracks.get(gid); const msg = currentMsgs.get(gid);
    if (current && msg) await msg.edit(nowPlaying(current, elapsedOf(gid), pausedStates.get(gid) || false, type)).catch(() => {});
    return interaction.reply(v2(`**${labelMap[type]}**`, colorMap[type]));
  }

  /* ════ /previous ════ */
  if (name === "previous") {
    const player = players.get(gid);
    if (!player) return interaction.reply(v2("❌ **บอทไม่ได้อยู่ในห้องเสียง**"));
    if (!inBotVc(interaction, gid)) return interaction.reply(v2(NEED_SAME_VC));
    const prev = previousTracks.get(gid);
    if (!prev) return interaction.reply(v2("❌ **ไม่มีเพลงก่อนหน้า**\nยังไม่มีประวัติเพลงที่จบไปแล้ว"));
    await interaction.deferReply(); stopInterval(gid); pausedStates.delete(gid); pausedElapsed.delete(gid);
    try {
      await player.playTrack({ track: { encoded: prev.track.encoded } });
      const t0 = Date.now();
      const msg = await interaction.editReply(nowPlaying(prev.track, 0, false, loopModes.get(gid) || "none"));
      startInterval(gid, prev.track, t0, msg, prev.channel || interaction.channel);
    } catch { await interaction.editReply({ content: "❌ เกิดข้อผิดพลาดขณะเล่นเพลงก่อนหน้า" }).catch(() => {}); }
    return;
  }

  /* ════ /nowplaying ════ */
  if (name === "nowplaying") {
    const current = currentTracks.get(gid);
    if (!players.has(gid) || !current) return interaction.reply(v2("## 🎵 ไม่มีเพลงที่กำลังเล่นอยู่", 0x95a5a6));
    const np = nowPlaying(current, elapsedOf(gid), pausedStates.get(gid) || false, loopModes.get(gid) || "none");
    return interaction.reply({ ...np, flags: np.flags | MessageFlags.Ephemeral });
  }

  /* ════ /queue ════ */
  if (name === "queue") {
    if (!players.has(gid)) return interaction.reply(v2("## 📋 คิวเพลง\nไม่มีคิวเพลง — บอทไม่ได้อยู่ในห้องเสียง", 0x95a5a6));
    const current = currentTracks.get(gid); const queue = queues.get(gid) || []; const paused = pausedStates.get(gid) || false;
    const lines = [];
    if (current) lines.push(`${paused ? "⏸" : "▶️"} **กำลังเล่น:** ${current.info?.title || "ไม่ทราบชื่อเพลง"}  \`${current.info?.length ? fmt(current.info.length) : "--:--"}\``);
    if (queue.length > 0) {
      lines.push("");
      queue.slice(0, 20).forEach((item, i) => lines.push(`**${i + 1}.** ${item.track.info?.title || "ไม่ทราบชื่อ"}  \`${item.track.info?.length ? fmt(item.track.info.length) : "--:--"}\``));
      if (queue.length > 20) lines.push(`-# และอีก ${queue.length - 20} เพลง`);
      lines.push(`\n-# รวม ${queue.length} เพลงในคิว`);
    } else if (!current) lines.push("ไม่มีคิวเพลง");
    else lines.push("\n-# ไม่มีเพลงรออยู่ในคิว");
    return interaction.reply(v2(`## 📋 คิวเพลง\n${lines.join("\n")}`, 0x9b59b6));
  }

  /* ════ /play ════ */
  if (name !== "play") return;

  const vc = interaction.member?.voice?.channel;
  if (!vc) return interaction.reply({ content: "กรุณาเข้าห้องเสียงก่อนครับ", ephemeral: true });

  const activeBotVcId = botVcIds.get(gid);
  const lockedId = LOCKED_CHANNELS[gid];

  if (activeBotVcId && activeBotVcId !== lockedId && vc.id !== activeBotVcId) {
    return interaction.reply(v2(`🔊 **ผมกำลังเล่นเพลงอยู่ที่ห้อง <#${activeBotVcId}>**\nกรุณาเข้าห้องนั้นก่อนแล้วลองใหม่อีกครั้ง`));
  }

  const query = interaction.options.getString("query");
  await interaction.deferReply();

  try {
    const node = shoukaku.options.nodeResolver(shoukaku.nodes);
    if (!node) return interaction.editReply("❌ Lavalink node ไม่พร้อม ลองใหม่อีกครั้งในสักครู่");

    const isUrl = query.startsWith("http://") || query.startsWith("https://");
    let track = null;

    if (isUrl) {
      const result = await node.rest.resolve(query);
      if (result?.loadType === LoadType.TRACK)    track = result.data;
      if (result?.loadType === LoadType.PLAYLIST) track = result.data?.tracks?.[0] ?? null;
      if (result?.loadType === LoadType.SEARCH)   track = result.data?.[0] ?? null;
    } else {
      for (const prefix of ["ytmsearch", "ytsearch", "scsearch"]) {
        const r = await node.rest.resolve(`${prefix}:${query}`);
        if (r?.loadType === LoadType.SEARCH && r.data?.length) { track = r.data[0]; break; }
      }
    }

    if (!track) return interaction.editReply("❌ ไม่พบเพลง กรุณาลองใหม่");

    /* มีเพลงเล่นอยู่แล้ว → เข้าคิว */
    if (players.has(gid) && currentTracks.has(gid)) {
      const queue = queues.get(gid) || [];
      queue.push({ track, channel: interaction.channel });
      queues.set(gid, queue);
      return interaction.editReply(v2(`✅ **เพิ่มเข้าคิวแล้ว**\n**${track.info?.title || "ไม่ทราบชื่อเพลง"}**\n-# อยู่ในคิวลำดับที่ ${queue.length}`, 0x2ecc71, false));
    }

    /* บอทอยู่ห้องล็อก → ออกก่อนแล้วย้ายไปห้องคน */
    if (lockedId && activeBotVcId === lockedId) {
      await dropPlayer(gid);
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log("[Voice] joining", vc.id);
    const player = await shoukaku.joinVoiceChannel({ guildId: gid, channelId: vc.id, shardId: 0 });
    players.set(gid, player);
    botVcIds.set(gid, vc.id);

    player.on("end", (data) => {
      // เล่นเพลงใหม่ทับ (ก่อนหน้า/วนซ้ำ) ไม่ต้องข้ามเพลง
      if (String(data?.reason).toLowerCase() === "replaced") return;
      console.log("[Player] end → play next");
      stopInterval(gid);
      playNext(gid);
    });
    player.on("exception", (e) => { console.error("[Player] exception", e?.exception?.message || e?.message); });
    player.on("error", (e) => { console.error("[Player] error", e?.message); stopInterval(gid); playNext(gid); });

    await player.playTrack({ track: { encoded: track.encoded } });
    console.log("[Player] playing:", track.info?.title);

    const t0 = Date.now();
    const msg = await interaction.editReply(nowPlaying(track, 0, false, "none"));
    startInterval(gid, track, t0, msg, interaction.channel);

  } catch (err) {
    console.error("[Play]", err);
    await interaction.editReply("❌ เกิดข้อผิดพลาด: " + err.message).catch(() => {});
  }
}

client.login(DISCORD_TOKEN);
