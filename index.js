require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags
} = require("discord.js");

const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState
} = require("@discordjs/voice");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =======================
// ⚙️ CONFIG
// =======================
const PREFIX = "b";

const GUILD_ID = process.env.GUILD_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;

const PANEL_CHANNEL_ID = "1494735880760328444";
const ROLE_GENTLEMAN = "1488390481908863067";
// pakai __dirname supaya file selalu di folder bot, walau bot dijalankan dari folder lain
const PANEL_MESSAGE_FILE = path.join(__dirname, "panel.json");
const PANEL_TITLE = "Gender Catalog";
// voice channel untuk verifikasi Ladies (ganti kalau beda dengan VC bot)
const VERIF_VOICE_ID = process.env.VERIF_VOICE_ID || VOICE_CHANNEL_ID;
const PANEL_IMAGE = "https://media.discordapp.net/attachments/1487590787284734143/1494745021381873835/Black_and_Silver_Star_Dust_Love_Facebook_Cover_1.png";

function buildGenderMenu() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("gender_select")
    .setPlaceholder("✨ Klik di sini untuk memilih roles!")
    .addOptions([
      {
        label: "Boy's",
        description: "Langsung dapat role Gentleman",
        value: "boy",
        emoji: "🚹"
      },
      {
        label: "Girl's",
        description: "Butuh verifikasi via voice bersama ADMIN",
        value: "girl",
        emoji: "🌸"
      }
    ]);

  return new ActionRowBuilder().addComponents(menu);
}

let connection;

// =======================
// 🔥 JOIN VC
// =======================
async function connectToVC() {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;

    connection = joinVoiceChannel({
      channelId: VOICE_CHANNEL_ID,
      guildId: GUILD_ID,
      adapterCreator: guild.voiceAdapterCreator,
      selfMute: false,
      selfDeaf: false
    });

    console.log("✅ Bot masuk voice");

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        console.log("🔄 Reconnecting VC...");
        connectToVC();
      }
    });

  } catch (err) {
    console.log("❌ Error:", err);
    setTimeout(connectToVC, 5000);
  }
}

// =======================
// 📦 PANEL SYSTEM
// =======================
function loadPanelId() {
  try {
    return JSON.parse(fs.readFileSync(PANEL_MESSAGE_FILE, "utf8")).messageId || null;
  } catch {
    return null;
  }
}

function savePanelId(id) {
  try {
    fs.writeFileSync(PANEL_MESSAGE_FILE, JSON.stringify({ messageId: id }));
  } catch (err) {
    console.log("⚠️ Gagal simpan panel.json:", err.message);
  }
}

async function sendOrUpdatePanel() {
  const channel = await client.channels.fetch(PANEL_CHANNEL_ID).catch(() => null);
  if (!channel) return console.log("❌ Channel panel tidak ditemukan");

  const savedId = loadPanelId();

  // Cari semua pesan milik bot di channel panel (tidak bergantung ke panel.json saja)
  const recent = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const botMsgs = recent
    ? [...recent.filter(m => m.author.id === client.user.id).values()] // urut terbaru dulu
    : [];

  let panelMsg =
    botMsgs.find(m => m.id === savedId) ||
    botMsgs.find(m => m.embeds[0]?.title === PANEL_TITLE) ||
    null;

  if (!panelMsg && savedId) {
    panelMsg = await channel.messages.fetch(savedId).catch(() => null);
  }

  // Hapus panel lama / duplikat yang numpuk
  for (const m of botMsgs) {
    if (m.id === panelMsg?.id) continue;
    await m.delete().catch(() => {});
    console.log(`🧹 Hapus panel duplikat ${m.id}`);
  }

  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(PANEL_TITLE)
    .setDescription(
`Silahkan pilih roles sesuai dengan gender kamu. Untuk role Ladies silahkan contact ADMIN untuk melakukan verifikasi.

🚹┃ **Boy's**
Langsung pilih melalui dropdown.

🌸┃ **Girl's**
Harus melalui verifikasi (Join Voice).`
    )
    .setImage(PANEL_IMAGE);

  const row = buildGenderMenu();

  if (panelMsg) {
    try {
      await panelMsg.edit({
        embeds: [embed],
        components: [row]
      });

      savePanelId(panelMsg.id);
      console.log("♻️ Panel di-update");
      return;
    } catch {
      console.log("⚠️ Gagal edit panel, kirim ulang");
      await panelMsg.delete().catch(() => {});
    }
  }

  const msg = await channel.send({
    embeds: [embed],
    components: [row]
  });

  savePanelId(msg.id);
  console.log("✅ Panel dikirim");
}

// =======================
// 🚀 READY
// =======================
client.once("clientReady", async () => {
  console.log(`🔥 Login sebagai ${client.user.tag}`);
  connectToVC();
  await sendOrUpdatePanel();
});

// =======================
// 🧹 AUTO CLEAN CHANNEL
// =======================
client.on("messageCreate", async (msg) => {
  if (msg.channel.id === PANEL_CHANNEL_ID && !msg.author.bot) {
    if (msg.deletable) {
      await msg.delete().catch(() => {});
    }
  }
});

// =======================
// 🎯 DROPDOWN HANDLER
// =======================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== "gender_select") return;

  const choice = interaction.values[0];

  // reset dropdown ke placeholder supaya bisa dipilih ulang
  interaction.message.edit({ components: [buildGenderMenu()] }).catch(() => {});

  // 🚹 BOY'S
  if (choice === "boy") {
    const member = interaction.member;

    if (member.roles.cache.has(ROLE_GENTLEMAN)) {
      return interaction.reply({
        content: "⚠️ Kamu sudah punya role ini",
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      await member.roles.add(ROLE_GENTLEMAN);
    } catch (err) {
      console.log("❌ Gagal kasih role:", err.message);
      return interaction.reply({
        content: "❌ Gagal memberikan role, hubungi ADMIN.",
        flags: MessageFlags.Ephemeral
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xff69b4)
      .setTitle("Role Updated")
      .setDescription(`✅ Added role:\n<@&${ROLE_GENTLEMAN}>`)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: "BETLEHEM • Role System" })
      .setTimestamp();

    console.log(`🚹 ${interaction.user.tag} pilih Boy's`);

    return interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }

  // 🌸 GIRL'S
  if (choice === "girl") {
    const embed = new EmbedBuilder()
      .setColor(0xff69b4)
      .setAuthor({
        name: "BETLEHEM • Ladies Verification",
        iconURL: interaction.guild.iconURL() || undefined
      })
      .setTitle("🌸 Hai, Ladies!")
      .setDescription(
`Role **Girl's** wajib melalui **verifikasi** dulu ya, biar server tetap aman & nyaman 💕

**📋 Cara Verifikasi**
> **1.** Join voice <#${VERIF_VOICE_ID}>
> **2.** Mention / hubungi **ADMIN** yang sedang online
> **3.** Verifikasi singkat lewat voice 🎙️
> **4.** Role akan diberikan oleh ADMIN ✨`
      )
      .addFields(
        { name: "⏱️ Estimasi", value: "± 1–5 menit", inline: true },
        { name: "🎧 Syarat", value: "Mic aktif", inline: true }
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: "BETLEHEM • Role System" })
      .setTimestamp();

    console.log(`🌸 ${interaction.user.tag} pilih Girl's`);

    return interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }
});

// =======================
// 🎮 COMMAND BASIC
// =======================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith(PREFIX)) return;

  const cmd = msg.content.slice(PREFIX.length).trim().toLowerCase();

  if (cmd === "ping") {
    msg.reply("🏓 Pong!");
  }

  if (cmd === "join") {
    connectToVC();
    msg.reply("✅ Masuk VC!");
  }

  if (cmd === "leave") {
    const conn = getVoiceConnection(GUILD_ID);
    if (conn) {
      conn.destroy();
      msg.reply("👋 Keluar VC!");
    }
  }
});

// =======================
// 🔐 LOGIN
// =======================
client.login(process.env.TOKEN);
