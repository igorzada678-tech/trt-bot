const { Client } = require("discord.js");
const express = require("express");
const fs = require("fs");

const BOT_TOKEN       = process.env.BOT_TOKEN;
const CANAL_ATIVACOES = process.env.CANAL_ID;
const API_PORT        = process.env.PORT || 3000;
const DB_FILE         = "licenses.json";

function loadDB() {
    if (!fs.existsSync(DB_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
    catch { return {}; }
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function addDias(dias) {
    const d = new Date(); d.setDate(d.getDate() + parseInt(dias));
    return d.toISOString().split("T")[0];
}
function hoje() { return new Date().toISOString().split("T")[0]; }
function diasRestantes(expDate) {
    const h = new Date(); h.setHours(0,0,0,0);
    const e = new Date(expDate + "T00:00:00");
    return Math.ceil((e - h) / 86400000);
}
function isAtivo(expDate) { return diasRestantes(expDate) > 0; }

const client = new Client({ intents: 34179 });

client.once("ready", () => {
    console.log("TRT Bot online: " + client.user.tag);
});

client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (msg.channel.id !== CANAL_ATIVACOES) return;
    if (!msg.content.startsWith("!")) return;
    const args = msg.content.trim().split(/\s+/);
    const cmd  = args[0].toLowerCase();
    const db   = loadDB();
    if (cmd === "!ativar") {
        if (args.length < 3) return msg.reply("Uso: !ativar HWID DIAS");
        const hwid = args[1].toUpperCase();
        const dias = parseInt(args[2]);
        if (isNaN(dias) || dias <= 0) return msg.reply("Dias invalido.");
        db[hwid] = { expira: addDias(dias), ativado_em: hoje(), dias };
        saveDB(db);
        await msg.reply("Licenca ativada! " + hwid + " | Expira: " + db[hwid].expira + " | Cliente liberado em 30s.");
    } else if (cmd === "!remover") {
        if (args.length < 2) return msg.reply("Uso: !remover HWID");
        const hwid = args[1].toUpperCase();
        if (!db[hwid]) return msg.reply("HWID nao encontrado.");
        delete db[hwid]; saveDB(db);
        await msg.reply("Removido: " + hwid + " | Bloqueado em 60s.");
    } else if (cmd === "!consultar") {
        if (args.length < 2) return msg.reply("Uso: !consultar HWID");
        const hwid = args[1].toUpperCase();
        const lic = db[hwid];
        if (!lic) return msg.reply("Nao encontrado: " + hwid);
        const dias = diasRestantes(lic.expira);
        await msg.reply(hwid + " | " + (isAtivo(lic.expira) ? "ATIVO " + dias + "d" : "EXPIRADO") + " | " + lic.expira);
    } else if (cmd === "!listar") {
        const keys = Object.keys(db);
        if (keys.length === 0) return msg.reply("Nenhuma licenca.");
        let txt = ""; let a=0,e=0;
        for (const h of keys) {
            const d = diasRestantes(db[h].expira);
            if (isAtivo(db[h].expira)) { txt += "OK " + h + " " + d + "d\n"; a++; }
            else { txt += "EXP " + h + "\n"; e++; }
        }
        txt += "Ativos:" + a + " Expirados:" + e;
        if (txt.length > 1900) txt = txt.substring(0,1900);
        await msg.reply(txt);
    } else if (cmd === "!ajuda") {
        await msg.reply("!ativar HWID DIAS | !remover HWID | !consultar HWID | !listar");
    }
});

const app = express();
app.get("/check", (req, res) => {
    const hwid = (req.query.hwid || "").toUpperCase().trim();
    if (!hwid) return res.json({ active: false, days_left: 0 });
    const db = loadDB(); const lic = db[hwid];
    if (!lic) return res.json({ active: false, days_left: 0 });
    const dias = diasRestantes(lic.expira);
    if (dias > 0) res.json({ active: true, days_left: dias, expira: lic.expira });
    else res.json({ active: false, days_left: 0 });
});
app.get("/", (req, res) => res.send("OK"));
app.listen(API_PORT, () => console.log("API porta " + API_PORT));

console.log("Iniciando... TOKEN:" + !!BOT_TOKEN + " CANAL:" + CANAL_ATIVACOES);
setInterval(() => { require("http").get("http://localhost:" + API_PORT + "/", ()=>{}).on("error",()=>{}); }, 240000);
client.on("error", e => console.error("Erro: " + e.message));
client.login(BOT_TOKEN).catch(e => { console.error("Login falhou: " + e.message); process.exit(1); });
