// ─── TRT Bot - Sistema de Licenças ───────────────────────────────────────────
// Comandos disponíveis (só funcionam no canal #ativações):
//   !ativar HWID DIAS     → ativa licença por X dias
//   !remover HWID         → remove licença
//   !listar               → lista todas as licenças
//   !consultar HWID       → consulta status de um HWID
//
// API HTTP (usada pelo .exe do cliente):
//   GET /check?hwid=XXXX  → retorna {"active":true/false,"days_left":N}

const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const fs = require("fs");

// ─── Config ──────────────────────────────────────────────────────────────────
const BOT_TOKEN      = process.env.BOT_TOKEN;       // seu token do bot
const CANAL_ATIVACOES = process.env.CANAL_ID;        // ID do canal #ativações
const API_PORT       = process.env.PORT || 3000;
const DB_FILE        = "licenses.json";

// ─── Banco de dados simples (JSON) ───────────────────────────────────────────
function loadDB() {
    if (!fs.existsSync(DB_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
    catch { return {}; }
}
function saveDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hoje() {
    return new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
}
function addDias(dias) {
    const d = new Date();
    d.setDate(d.getDate() + parseInt(dias));
    return d.toISOString().split("T")[0];
}
function diasRestantes(expDate) {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const exp  = new Date(expDate + "T00:00:00");
    const diff = Math.ceil((exp - hoje) / 86400000);
    return diff;
}
function isAtivo(expDate) {
    return diasRestantes(expDate) > 0;
}

// ─── Discord Bot ─────────────────────────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

client.once("ready", () => {
    console.log(`✅ TRT Bot online como ${client.user.tag}`);
});

client.on("messageCreate", async (msg) => {
    // Só responde no canal de ativações e ignora outros bots
    if (msg.author.bot) return;
    if (msg.channel.id !== CANAL_ATIVACOES) return;
    if (!msg.content.startsWith("!")) return;

    const args    = msg.content.trim().split(/\s+/);
    const cmd     = args[0].toLowerCase();
    const db      = loadDB();

    // ── !ativar HWID DIAS ──
    if (cmd === "!ativar") {
        if (args.length < 3) {
            return msg.reply("❌ Uso: `!ativar HWID DIAS`\nExemplo: `!ativar BFE8459C-B002815B-35161366 30`");
        }
        const hwid = args[1].toUpperCase();
        const dias = parseInt(args[2]);
        if (isNaN(dias) || dias <= 0) return msg.reply("❌ Número de dias inválido.");

        const expira = addDias(dias);
        db[hwid] = { expira, ativado_em: hoje(), dias };
        saveDB(db);

        await msg.reply(
            `✅ **Licença ativada!**\n` +
            `> HWID: \`${hwid}\`\n` +
            `> Expira em: **${expira}** (${dias} dias)\n` +
            `> O cliente será liberado automaticamente em até 30 segundos.`
        );
    }

    // ── !remover HWID ──
    else if (cmd === "!remover") {
        if (args.length < 2) return msg.reply("❌ Uso: `!remover HWID`");
        const hwid = args[1].toUpperCase();
        if (!db[hwid]) return msg.reply(`❌ HWID \`${hwid}\` não encontrado.`);
        delete db[hwid];
        saveDB(db);
        await msg.reply(`🗑️ Licença de \`${hwid}\` removida. Acesso bloqueado em até 30 segundos.`);
    }

    // ── !consultar HWID ──
    else if (cmd === "!consultar") {
        if (args.length < 2) return msg.reply("❌ Uso: `!consultar HWID`");
        const hwid = args[1].toUpperCase();
        const lic = db[hwid];
        if (!lic) return msg.reply(`❌ HWID \`${hwid}\` não encontrado no sistema.`);
        const dias = diasRestantes(lic.expira);
        const status = isAtivo(lic.expira) ? `✅ ATIVO (${dias} dias restantes)` : `❌ EXPIRADO`;
        await msg.reply(
            `📋 **Consulta de licença**\n` +
            `> HWID: \`${hwid}\`\n` +
            `> Status: ${status}\n` +
            `> Expira: ${lic.expira}`
        );
    }

    // ── !listar ──
    else if (cmd === "!listar") {
        const keys = Object.keys(db);
        if (keys.length === 0) return msg.reply("📭 Nenhuma licença cadastrada.");

        let ativos = 0, expirados = 0;
        let texto = "📋 **Lista de licenças:**\n\n";
        for (const hwid of keys) {
            const lic = db[hwid];
            const dias = diasRestantes(lic.expira);
            if (isAtivo(lic.expira)) {
                texto += `✅ \`${hwid}\` — ${dias}d restantes (exp: ${lic.expira})\n`;
                ativos++;
            } else {
                texto += `❌ \`${hwid}\` — EXPIRADO (${lic.expira})\n`;
                expirados++;
            }
        }
        texto += `\n**Total: ${keys.length} | Ativos: ${ativos} | Expirados: ${expirados}**`;

        // Discord tem limite de 2000 chars por mensagem
        if (texto.length > 1900) {
            texto = texto.substring(0, 1900) + "\n... (lista cortada)";
        }
        await msg.reply(texto);
    }

    // ── !ajuda ──
    else if (cmd === "!ajuda") {
        await msg.reply(
            "🤖 **TRT Bot — Comandos:**\n" +
            "`!ativar HWID DIAS` — Ativa licença\n" +
            "`!remover HWID` — Remove licença\n" +
            "`!consultar HWID` — Consulta um HWID\n" +
            "`!listar` — Lista todas as licenças"
        );
    }
});

// ─── API HTTP (consultada pelo .exe do cliente) ───────────────────────────────
const app = express();

app.get("/check", (req, res) => {
    const hwid = (req.query.hwid || "").toUpperCase().trim();
    if (!hwid) return res.json({ active: false, days_left: 0, error: "no_hwid" });

    const db  = loadDB();
    const lic = db[hwid];
    if (!lic) return res.json({ active: false, days_left: 0 });

    const dias = diasRestantes(lic.expira);
    if (dias > 0) {
        res.json({ active: true, days_left: dias, expira: lic.expira });
    } else {
        res.json({ active: false, days_left: 0, expira: lic.expira });
    }
});

// Health check pro Railway/Render saber que está vivo
app.get("/", (req, res) => res.send("TRT Bot API online"));

app.listen(API_PORT, () => {
    console.log(`🌐 API rodando na porta ${API_PORT}`);
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(BOT_TOKEN);
