require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    Events
} = require("discord.js");

const axios = require("axios");

module.exports = (client) => {
    console.log("⚡ โหลดโมดูล Auto_QUEST สำเร็จ!");

    const API_KEY = process.env.API_KEY || "";
    const API_BASE = process.env.API_BASE || "http://prem-eu3.bot-hosting.net:21693/api/q/aq";

    const cooldown = new Set();

    // ดักฟังข้อความพิมพ์ !aq เพื่อเรียกเมนูเควส
    client.on("messageCreate", async (msg) => {
        if (msg.author.bot) return;

        if (msg.content === "!aq") {
            const embed = new EmbedBuilder()
                .setColor("#5865F2")
                .setTitle("⚡ AQ QUEST SYSTEM")
                .setDescription("ระบบ Quest API แบบใหม่\nเลือกเมนูด้านล่าง")
                .addFields(
                    {
                        name: "🚀 Auto Quest",
                        value: "ทำทุกเควสอัตโนมัติ",
                        inline: true
                    },
                    {
                        name: "📋 Quest List",
                        value: "ดูรายการเควส",
                        inline: true
                    },
                    {
                        name: "🔎 Search Quest",
                        value: "ค้นหาเควส",
                        inline: true
                    }
                )
                .setImage('https://cdn.discordapp.com/attachments/1498985180633759804/1504391719226048603/1c22b9ddc074b2480799a3bf4a03f28c.jpg?ex=6a06d178&is=6a057ff8&hm=76ecf6bb07251a1eabe80f8db370b0965d48848f8601d3594b0ba0895c1b5fc4')
                .setFooter({
                    text: `Requested by ${msg.author.username}`
                })
                .setThumbnail(msg.author.displayAvatarURL())
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("aq_menu")
                    .setPlaceholder("เลือกเมนู")
                    .addOptions([
                        {
                            label: "🚀 Auto Quest",
                            description: "ทำเควสทั้งหมดอัตโนมัติ",
                            value: "auto"
                        },
                        {
                            label: "📋 Quest List",
                            description: "ดูรายการเควส",
                            value: "list"
                        },
                        {
                            label: "🔎 Search Quest",
                            description: "ค้นหาเควส",
                            value: "search"
                        }
                    ])
            );

            await msg.reply({
                embeds: [embed],
                components: [row]
            });
        }
    });

    // จัดการ Interaction ทั้ง Select Menu และ Modal Submit
    client.on(Events.InteractionCreate, async (interaction) => {
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId !== "aq_menu") return;

            if (cooldown.has(interaction.user.id)) {
                return interaction.reply({
                    content: "⏳ กรุณารอสักครู่",
                    ephemeral: true
                });
            }

            cooldown.add(interaction.user.id);
            setTimeout(() => {
                cooldown.delete(interaction.user.id);
            }, 3000);

            const value = interaction.values[0];

            if (value === "auto") {
                const modal = new ModalBuilder()
                    .setCustomId("aq_auto_modal")
                    .setTitle("AUTO QUEST");

                const tokenInput = new TextInputBuilder()
                    .setCustomId("token")
                    .setLabel("Discord Token")
                    .setPlaceholder("วาง Token")
                    .setRequired(true)
                    .setStyle(TextInputStyle.Short);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(tokenInput)
                );

                return interaction.showModal(modal);
            }

            if (value === "list") {
                const modal = new ModalBuilder()
                    .setCustomId("aq_list_modal")
                    .setTitle("QUEST LIST");

                const tokenInput = new TextInputBuilder()
                    .setCustomId("token")
                    .setLabel("Discord Token")
                    .setRequired(true)
                    .setStyle(TextInputStyle.Short);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(tokenInput)
                );

                return interaction.showModal(modal);
            }

            if (value === "search") {
                const modal = new ModalBuilder()
                    .setCustomId("aq_search_modal")
                    .setTitle("SEARCH QUEST");

                const tokenInput = new TextInputBuilder()
                    .setCustomId("token")
                    .setLabel("Discord Token")
                    .setRequired(true)
                    .setStyle(TextInputStyle.Short);

                const searchInput = new TextInputBuilder()
                    .setCustomId("search")
                    .setLabel("ชื่อเควส")
                    .setPlaceholder("เช่น crab")
                    .setRequired(true)
                    .setStyle(TextInputStyle.Short);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(tokenInput),
                    new ActionRowBuilder().addComponents(searchInput)
                );

                return interaction.showModal(modal);
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === "aq_auto_modal") {
                const token = interaction.fields.getTextInputValue("token");

                await interaction.deferReply({ ephemeral: true });

                try {
                    const loading = new EmbedBuilder()
                        .setColor("Yellow")
                        .setTitle("⏳ กำลังทำ Quest...")
                        .setDescription("กรุณารอสักครู่");

                    await interaction.editReply({ embeds: [loading] });

                    const res = await axios.post(
                        `${API_BASE}`,
                        { token },
                        {
                            headers: {
                                "x-api-key": API_KEY,
                                "Content-Type": "application/json"
                            },
                            timeout: 0
                        }
                    );

                    const data = res.data || {};
                    const logs = (data.logs || [])
                        .slice(-15)
                        .map((x) => x.text || x)
                        .join("\n");

                    const stats = data.stats || {};

                    const embed = new EmbedBuilder()
                        .setColor(stats.failed > 0 ? "Orange" : "Green")
                        .setTitle("⚡ QUEST RESULT")
                        .setDescription("```" + (logs || "ไม่มี log") + "```")
                        .addFields(
                            {
                                name: "✅ Success",
                                value: String(stats.completed || 0),
                                inline: true
                            },
                            {
                                name: "❌ Failed",
                                value: String(stats.failed || 0),
                                inline: true
                            },
                            {
                                name: "📌 Total",
                                value: String(stats.total || 0),
                                inline: true
                            },
                            {
                                name: "📡 Status",
                                value: stats.status || "unknown",
                                inline: true
                            },
                            {
                                name: "💸 Cost",
                                value: String(data.cost || 0),
                                inline: true
                            },
                            {
                                name: "💰 Balance",
                                value: String(data.balance || 0),
                                inline: true
                            }
                        )
                        .setTimestamp();

                    await interaction.editReply({ embeds: [embed] });
                } catch (err) {
                    console.error(err);
                    const embed = new EmbedBuilder()
                        .setColor("Red")
                        .setTitle("❌ ERROR")
                        .setDescription(
                            "```" +
                                (err.response?.data?.error || err.message) +
                                "```"
                        );

                    await interaction.editReply({ embeds: [embed] });
                }
            }

            if (interaction.customId === "aq_list_modal") {
                const token = interaction.fields.getTextInputValue("token");

                await interaction.deferReply({ ephemeral: true });

                try {
                    const res = await axios.post(
                        `${API_BASE}/list`,
                        { token },
                        {
                            headers: {
                                "x-api-key": API_KEY
                            }
                        }
                    );

                    const quests = res.data.quests || [];
                    const text =
                        quests.length > 0
                            ? quests
                                  .slice(0, 20)
                                  .map((q, i) => `${i + 1}. ${q.name}`)
                                  .join("\n")
                            : "ไม่มีเควส";

                    const embed = new EmbedBuilder()
                        .setColor("Blue")
                        .setTitle("📋 QUEST LIST")
                        .setDescription("```" + text + "```")
                        .addFields({
                            name: "📌 Total",
                            value: String(quests.length),
                            inline: true
                        });

                    await interaction.editReply({ embeds: [embed] });
                } catch (err) {
                    const embed = new EmbedBuilder()
                        .setColor("Red")
                        .setTitle("❌ ERROR")
                        .setDescription(
                            "```" +
                                (err.response?.data?.error || err.message) +
                                "```"
                        );

                    await interaction.editReply({ embeds: [embed] });
                }
            }

            if (interaction.customId === "aq_search_modal") {
                const token = interaction.fields.getTextInputValue("token");
                const search = interaction.fields.getTextInputValue("search");

                await interaction.deferReply({ ephemeral: true });

                try {
                    const res = await axios.post(
                        `${API_BASE}/search`,
                        {
                            token,
                            name: search
                        },
                        {
                            headers: {
                                "x-api-key": API_KEY
                            }
                        }
                    );

                    const quests = res.data.quests || [];
                    const text =
                        quests.length > 0
                            ? quests
                                  .slice(0, 20)
                                  .map((q, i) => `${i + 1}. ${q.name}`)
                                  .join("\n")
                            : "ไม่พบเควส";

                    const embed = new EmbedBuilder()
                        .setColor("Green")
                        .setTitle("🔎 SEARCH RESULT")
                        .setDescription("```" + text + "```")
                        .addFields({
                            name: "📌 Result",
                            value: String(quests.length),
                            inline: true
                        });

                    await interaction.editReply({ embeds: [embed] });
                } catch (err) {
                    const embed = new EmbedBuilder()
                        .setColor("Red")
                        .setTitle("❌ ERROR")
                        .setDescription(
                            "```" +
                                (err.response?.data?.error || err.message) +
                                "```"
                        );

                    await interaction.editReply({ embeds: [embed] });
                }
            }
        }
    });
};
