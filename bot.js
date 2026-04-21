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
const BOT_TOKEN       = process.env.BOT_TOKEN;
const CANAL_ATIVACOES = process.env.CANAL_ID;
const API_PORT        = process.env.PORT || 3000;
const DB_FILE         = "licenses.json";

// ─── Validação de variáveis obrigatórias ─────────────────────────────────────
if (!BOT_TOKEN) {
    console.error("❌ ERRO: variável BOT_TOKEN não definida!");
    process.exit(1);
}
if (!CANAL_ATIVACOES) {
    console.error("❌ ERRO: variável CANAL_ID não definida!");
    process.exit(1);
}

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
    return new Date().toISOString().split("T")[0];
}
function addDias(dias) {
    const d = new Date();
    d.setDate(d.getDate() + parseInt(dias));
    return d.toISOString().split("T")[0];
}
function diasRestantes(expDate) {
    const agora = new Date(); agora.setHours(0, 0, 0, 0);
    const exp   = new Date(expDate + "T00:00:00");
    return Math.ceil((exp - agora) / 86400000);
}
function isAtivo(expDate) {
    return diasRestantes(expDate) > 0;
}

// ─── Discord Client ───────────────────────────────────────────────────────────
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

// Reconexão automática em caso de erro de rede
client.on("error", (err) => {
    console.error("⚠️ Erro no client Discord:", err.message);
});

client.on("warn", (info) => {
    console.warn("⚠️ Aviso Discord:", info);
});

// ─── Comandos ─────────────────────────────────────────────────────────────────
client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (msg.channel.id !== CANAL_ATIVACOES) return;
    if (!msg.content.startsWith("!")) return;

    const args = msg.content.trim().split(/\s+/);
    const cmd  = args[0].toLowerCase();
    const db   = loadDB();

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

        return msg.reply(
            `✅ **Licença ativada!**\n` +
            `> HWID: \`${hwid}\`\n` +
            `> Expira em: **${expira}** (${dias} dias)\n` +
            `> O cliente será liberado automaticamente em até 30 segundos.`
        );
    }

    // ── !remover HWID ──
    if (cmd === "!remover") {
        if (args.length < 2) return msg.reply("❌ Uso: `!remover HWID`");
        const hwid = args[1].toUpperCase();
        if (!db[hwid]) return msg.reply(`❌ HWID \`${hwid}\` não encontrado.`);
        delete db[hwid];
        saveDB(db);
        return msg.reply(`🗑️ Licença de \`${hwid}\` removida. Acesso bloqueado em até 30 segundos.`);
    }

    // ── !consultar HWID ──
    if (cmd === "!consultar") {
        if (args.length < 2) return msg.reply("❌ Uso: `!consultar HWID`");
        const hwid = args[1].toUpperCase();
        const lic  = db[hwid];
        if (!lic) return msg.reply(`❌ HWID \`${hwid}\` não encontrado no sistema.`);
        const dias   = diasRestantes(lic.expira);
        const status = isAtivo(lic.expira) ? `✅ ATIVO (${dias} dias restantes)` : `❌ EXPIRADO`;
        return msg.reply(
            `📋 **Consulta de licença**\n` +
            `> HWID: \`${hwid}\`\n` +
            `> Status: ${status}\n` +
            `> Expira: ${lic.expira}`
        );
    }

    // ── !listar ──
    if (cmd === "!listar") {
        const keys = Object.keys(db);
        if (keys.length === 0) return msg.reply("📭 Nenhuma licença cadastrada.");

        let ativos = 0, expirados = 0;
        let texto = "📋 **Lista de licenças:**\n\n";
        for (const hwid of keys) {
            const lic  = db[hwid];
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

        if (texto.length > 1900) {
            texto = texto.substring(0, 1900) + "\n... (lista cortada)";
        }
        return msg.reply(texto);
    }

    // ── !ajuda ──
    if (cmd === "!ajuda") {
        return msg.reply(
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
        return res.json({ active: true, days_left: dias, expira: lic.expira });
    } else {
        return res.json({ active: false, days_left: 0, expira: lic.expira });
    }
});

// Health check para o Render saber que está vivo
app.get("/", (req, res) => res.send("TRT Bot API online"));

app.listen(API_PORT, () => {
    console.log(`🌐 API rodando na porta ${API_PORT}`);
});

// ─── Login com reconexão automática ──────────────────────────────────────────
console.log("Iniciando TRT Bot...");
console.log("TOKEN presente:", !!BOT_TOKEN);
console.log("CANAL_ID:", CANAL_ATIVACOES);

async function iniciar() {
    try {
        await client.login(BOT_TOKEN);
    } catch (err) {
        console.error("❌ ERRO ao fazer login:", err.message);
        console.log("🔄 Tentando reconectar em 15 segundos...");
        setTimeout(iniciar, 15000);
    }
}

iniciar();
