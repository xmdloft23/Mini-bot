const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const { Octokit } = require('@octokit/rest');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const util = require('util');
const yts = require("yt-search");
const fetch = require("node-fetch");
const FormData = require('form-data');

const { initUserEnvIfMissing } = require('./settingsdb');
const { initEnvsettings, getSetting } = require('./settings');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    proto,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    downloadContentFromMessage
} = require('@whiskeysockets/baileys');

// ═══════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════
const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['🧩', '🍉', '💜', '🌟', '🪴', '💊', '💫', '🍂', '🎋', '😶‍🌫️', '🫀', '🧿', '👀', '🇹🇿', '🚩', '🥰', '🗿', '💙', '🌝', '🖤', '💚'],
    PREFIX: '.',
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/G3ChQEjwrdVBTBUQHWSNHF?mode=ems_copy_t',
    ADMIN_LIST_PATH: './admin.json',
    IMAGE_PATH: 'https://files.catbox.moe/2x9ktu.png',
    NEWSLETTER_JID: '120363424095366093@newsletter',
    NEWSLETTER_MESSAGE_ID: '0088',
    OTP_EXPIRY: 300000,
    BOT_NAME: '☭𝙻𝙾𝙵𝚃-𝚀𝚄𝙰𝙽𝚃𝚄𝙼☭',
    OWNER_NAME: '𝙻𝚘𝚏𝚝',
    OWNER_NUMBER: '255778018545',
    BOT_VERSION: '1.0.0',
    BOT_FOOTER: '> 𝚙𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚂𝚒𝚛 𝙻𝙾𝙵𝚃',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbBe2WY7j6g9hbbT6F0N'
};

const GIFTED_TECH_API = 'https://api.giftedtech.co.ke';
const GIFTED_API_KEY = 'gifted';
const audioEndpoints = ['ytmp3', 'ytaudio'];
const videoEndpoints = ['ytmp4', 'ytvideo'];
const tiktokEndpoints = ['tikdown', 'tiktok'];
const igEndpoints = ['instagram', 'igdown'];
const fbEndpoints = ['fbdown2', 'fbdown'];
const twitterEndpoints = ['twitterdown', 'twitter'];

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function formatMessage(title, content, footer) {
    return `${title}\n\n${content}\n\n${footer}`;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

function runtime(seconds) {
    seconds = Number(seconds);
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    return (d > 0 ? d + "d " : "") + (h > 0 ? h + "h " : "") + (m > 0 ? m + "m " : "") + (s > 0 ? s + "s" : "");
}

function capital(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const createSerial = (size) => crypto.randomBytes(size).toString('hex').slice(0, size);
const isValidBuffer = (buf) => Buffer.isBuffer(buf) && buf.length > 1024;

async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}

async function ossBuffer(url) {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
    return Buffer.from(res.data);
}

async function formatAudio(buffer) { return buffer; }
async function formatVideo(buffer) { return buffer; }

async function searchYouTube(query) {
    try {
        const search = await yts(query);
        if (!search.videos || search.videos.length === 0) return null;
        return search.videos.slice(0, 10).map(item => ({
            title: item.title || 'Unknown',
            url: item.url || `https://youtube.com/watch?v=${item.videoId}`,
            thumbnail: item.thumbnail || 'https://files.catbox.moe/a65obv.jpg',
            channel: item.author?.name || 'YouTube',
            duration: item.timestamp || 'N/A',
            views: item.views || 'N/A'
        }));
    } catch (e) {
        console.error('Search error:', e.message);
        return null;
    }
}

async function queryGiftedAPI(query, endpoints, timeout = 25000) {
    for (const endpoint of endpoints) {
        try {
            const apiUrl = `${GIFTED_TECH_API}/api/download/${endpoint}?apikey=${GIFTED_API_KEY}&url=${encodeURIComponent(query)}`;
            const res = await axios.get(apiUrl, { timeout });
            if (res.data?.status === 200 || res.data?.success) {
                const downloadUrl = res.data?.result?.download_url || res.data?.result?.url || res.data?.download_url || res.data?.url;
                if (downloadUrl) return { success: true, data: res.data, endpoint, download_url: downloadUrl };
            }
        } catch (e) { continue; }
    }
    return { success: false, error: "All endpoints failed" };
}

async function downloadMediaMessage(msg, type) {
    const stream = await msg.download();
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

async function writeExifImg(buffer, metadata) {
    const { Sticker, StickerTypes } = require('wa-sticker-formatter');
    const sticker = new Sticker(buffer, {
        pack: metadata.packname,
        author: metadata.author,
        type: StickerTypes.FULL,
        quality: 80
    });
    return await sticker.toBuffer();
}

async function getLoftAIResponse(text) {
    try {
        const res = await axios.get(`https://api.giftedtech.co.ke/api/ai/gpt?apikey=gifted&q=${encodeURIComponent(text)}`, { timeout: 20000 });
        return res.data?.result || null;
    } catch (e) {
        return null;
    }
}

function generateResponseButtons(text, response) {
    return [];
}

function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Failed to load admin list:', error);
        return [];
    }
}

// ═══════════════════════════════════════════════
// COMMANDS LIST
// ═══════════════════════════════════════════════
const allCommands = [
    { num: 1, cmd: '.alive', desc: 'Bot status' },
    { num: 2, cmd: '.ping', desc: 'Latency & stats' },
    { num: 3, cmd: '.owner', desc: 'Owner info' },
    { num: 4, cmd: '.publicmode', desc: 'Public mode' },
    { num: 5, cmd: '.privatemode', desc: 'Private mode' },
    { num: 6, cmd: '.jid', desc: 'Your JID' },
    { num: 7, cmd: '.loft', desc: 'AI chat' },
    { num: 8, cmd: '.img [desc]', desc: 'Generate image' },
    { num: 9, cmd: '.sticker', desc: 'Create sticker' },
    { num: 10, cmd: '.vv', desc: 'View once' },
    { num: 11, cmd: '.emojimix', desc: 'Mix emojis' },
    { num: 12, cmd: '.quote', desc: 'GTA V quote' },
    { num: 13, cmd: '.calc', desc: 'Calculate' },
    { num: 14, cmd: '.tourl', desc: 'Upload to URL' },
    { num: 15, cmd: '.meme', desc: 'Random meme' },
    { num: 16, cmd: '.ytsearch', desc: 'Search YouTube' },
    { num: 17, cmd: '.news', desc: 'Latest news' },
    { num: 18, cmd: '.play', desc: 'Download audio' },
    { num: 19, cmd: '.video', desc: 'Download video' },
    { num: 20, cmd: '.sendaudio', desc: 'Send audio from URL' },
    { num: 21, cmd: '.sendvideo', desc: 'Send video from URL' },
    { num: 22, cmd: '.tiktok', desc: 'Download TikTok' },
    { num: 23, cmd: '.ig', desc: 'Download Instagram' },
    { num: 24, cmd: '.fb', desc: 'Download Facebook' },
    { num: 25, cmd: '.twitter', desc: 'Download Twitter' },
    { num: 26, cmd: '.lyrics', desc: 'Song lyrics' },
    { num: 27, cmd: '.qouteislamic', desc: 'Islamic quote' },
    { num: 28, cmd: '.qoutechristian', desc: 'Christian quote' },
    { num: 29, cmd: '.tempmail', desc: 'Temp mail' },
    { num: 30, cmd: '.tagall', desc: 'Tag everyone' },
    { num: 31, cmd: '.hidetag', desc: 'Hidden tag' },
    { num: 32, cmd: '.tagadmins', desc: 'Tag admins' },
    { num: 33, cmd: '.promote', desc: 'Promote to admin' },
    { num: 34, cmd: '.demote', desc: 'Demote admin' },
    { num: 35, cmd: '.kick', desc: 'Kick member' },
    { num: 36, cmd: '.add', desc: 'Add member' },
    { num: 37, cmd: '.mute', desc: 'Mute group' },
    { num: 38, cmd: '.unmute', desc: 'Unmute group' },
    { num: 39, cmd: '.groupname', desc: 'Change group name' },
    { num: 40, cmd: '.gcdesc', desc: 'Change description' },
    { num: 41, cmd: '.link', desc: 'Group link' },
    { num: 42, cmd: '.resetlink', desc: 'Reset link' },
    { num: 43, cmd: '.listrequests', desc: 'Join requests' },
    { num: 44, cmd: '.accept', desc: 'Accept request' },
    { num: 45, cmd: '.reject', desc: 'Reject request' },
    { num: 46, cmd: '.acceptall', desc: 'Accept all' },
    { num: 47, cmd: '.rejectall', desc: 'Reject all' },
    { num: 48, cmd: '.met', desc: 'Group metadata' },
    { num: 49, cmd: '.online', desc: 'Online members' },
    { num: 50, cmd: '.newgroup', desc: 'Create group' },
    { num: 51, cmd: '.left', desc: 'Leave group' },
    { num: 52, cmd: '.onwa', desc: 'Check WhatsApp' },
    { num: 53, cmd: '.vcf', desc: 'Export contacts' },
    { num: 54, cmd: '.status', desc: 'System status' },
    { num: 55, cmd: '.loftmeta', desc: 'LOFT META' },
    { num: 56, cmd: '.getcode', desc: 'View code files' },
    { num: 57, cmd: '.waifu', desc: 'Random waifu' },
    { num: 58, cmd: '.pair', desc: 'Pair bot' },
    { num: 59, cmd: '.catbox', desc: 'Upload to catbox' },
];

// ═══════════════════════════════════════════════
// BUTTON V2 CLASS
// ═══════════════════════════════════════════════
class ButtonV2 {
    constructor(socket) {
        this.socket = socket;
        this.buttons = [];
        this.title = '';
        this.subtitle = '';
        this.body = '';
        this.footer = '';
        this.thumbnail = '';
        this.contextInfo = {};
        this.mentions = [];
    }
    setTitle(t) { this.title = t; return this; }
    setSubtitle(t) { this.subtitle = t; return this; }
    setBody(b) { this.body = b; return this; }
    setFooter(f) { this.footer = f; return this; }
    setThumbnail(u) { this.thumbnail = u; return this; }
    setContextInfo(c) { this.contextInfo = c; return this; }
    setMentions(m) { this.mentions = m || []; return this; }
    addButton(text, id) { this.buttons.push({ buttonId: id, buttonText: { displayText: text }, type: 1 }); return this; }
    addUrlButton(text, url) { this.buttons.push({ buttonId: url, buttonText: { displayText: text }, type: 2 }); return this; }
    addRawButton(btn) { this.buttons.push(btn); return this; }

    async send(chatId, options = {}) {
        try {
            const contextInfo = {
                ...this.contextInfo,
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "120363398106360290@newsletter",
                    newsletterName: "LOFTxmd"
                }
            };
            if (this.mentions && this.mentions.length > 0) contextInfo.mentionedJid = this.mentions;

            const msg = generateWAMessageFromContent(chatId, {
                buttonsMessage: {
                    contentText: this.body,
                    footerText: this.footer || `🛍️ ʟᴏꜰᴛ-ᴏꜱꜱ ɪɴᴄ`,
                    headerType: 6,
                    locationMessage: {
                        degreesLatitude: 0,
                        degreesLongitude: 0,
                        name: this.title || 'ʟᴏꜰᴛ-ᴏꜱꜱ',
                        address: this.subtitle || "",
                        jpegThumbnail: null
                    },
                    viewOnce: true,
                    contextInfo: contextInfo,
                    buttons: this.buttons.length > 0 ? this.buttons : [
                        { buttonId: ".menu", buttonText: { displayText: '📋 MENU' }, type: 1 }
                    ]
                }
            }, { userJid: this.socket.user.id });

            await this.socket.relayMessage(chatId, msg.message, {
                messageId: msg.key.id,
                additionalNodes: [{
                    tag: 'biz', attrs: {},
                    content: [{
                        tag: 'interactive',
                        attrs: { type: 'native_flow', v: '1' },
                        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
                    }]
                }]
            });
        } catch (err) {
            console.error('ButtonV2 Error:', err);
            await this.socket.sendMessage(chatId, { text: this.body }, options);
        }
    }
}

// ═══════════════════════════════════════════════
// OCTOKIT & STORAGE
// ═══════════════════════════════════════════════
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = process.env.GITHUB_REPO_OWNER;
const repo = process.env.GITHUB_REPO_NAME;

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';
const otpStore = new Map();
let botMode = 'public';

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

// ═══════════════════════════════════════════════
// SESSION HELPERS
// ═══════════════════════════════════════════════
async function cleanDuplicateFiles(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({ owner, repo, path: 'session' });
        const sessionFiles = data.filter(file =>
            file.name.startsWith(`empire_${sanitizedNumber}_`) && file.name.endsWith('.json')
        ).sort((a, b) => {
            const timeA = parseInt(a.name.match(/empire_\d+_(\d+)\.json/)?.[1] || 0);
            const timeB = parseInt(b.name.match(/empire_\d+_(\d+)\.json/)?.[1] || 0);
            return timeB - timeA;
        });
        if (sessionFiles.length > 1) {
            for (let i = 1; i < sessionFiles.length; i++) {
                await octokit.repos.deleteFile({
                    owner, repo,
                    path: `session/${sessionFiles[i].name}`,
                    message: `Delete duplicate for ${sanitizedNumber}`,
                    sha: sessionFiles[i].sha
                });
            }
        }
    } catch (error) {
        console.error(`Failed clean duplicate:`, error.message);
    }
}

async function sendAdminConnectMessage(socket, number, groupResult) {
    const admins = loadAdmins();
    const caption = formatMessage('*Connected ✅*', `📞 Number: ${number}\n❤️ Status: Online`, config.BOT_FOOTER);
    for (const admin of admins) {
        try {
            await socket.sendMessage(`${admin}@s.whatsapp.net`, { image: { url: config.IMAGE_PATH }, caption });
        } catch (error) { }
    }
}

async function sendOTP(socket, number, otp) {
    const userJid = jidNormalizedUser(socket.user.id);
    const message = formatMessage('*🔐 OTP VERIFICATION*', `Your OTP: *${otp}*\nExpires in 5 minutes.`, config.BOT_FOOTER);
    try {
        await socket.sendMessage(userJid, { text: message });
    } catch (error) { throw error; }
}

// ═══════════════════════════════════════════════
// STATUS / NEWSLETTER / REVOCATION HANDLERS
// ═══════════════════════════════════════════════
function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== config.NEWSLETTER_JID) return;
        try {
            const emojis = ['🧩', '🍉', '💜', '🌟', '🪴', '🎂', '💫', '🔫', '🎋', '😶‍🌫️', '🫀', '🧿', '👀', '💔', '🚩', '🥰', '😭', '💙', '🌝', '🖤', '💚'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.newsletterServerId;
            if (!messageId) return;
            await socket.newsletterReactMessage(config.NEWSLETTER_JID, messageId.toString(), randomEmoji);
        } catch (error) { }
    });
}

async function setupStatusHandlers(socket) {
    const autoReact = getSetting('AUTO_REACT') || 'on';
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
        try {
            if (autoReact === 'on') {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }
            if (config.AUTO_VIEW_STATUS === 'true') {
                try { await socket.readMessages([message.key]); } catch (e) { }
            }
            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                try {
                    await socket.sendMessage(message.key.remoteJid, { react: { text: randomEmoji, key: message.key } }, { statusJidList: [message.key.participant] });
                } catch (e) { }
            }
        } catch (error) { }
    });
}

async function handleMessageRevocation(socket, number) {
    socket.ev.on('messages.delete', async ({ keys }) => {
        if (!keys || keys.length === 0) return;
        const messageKey = keys[0];
        const userJid = jidNormalizedUser(socket.user.id);
        const message = formatMessage('╭──◯', `✖ \`D E L E T E\`\n✖ *From:* ${messageKey.remoteJid}\n✖ *Time:* ${getSriLankaTimestamp()}\n╰──◯`, config.BOT_FOOTER);
        try {
            await socket.sendMessage(userJid, { image: { url: config.IMAGE_PATH }, caption: message });
        } catch (error) { }
    });
}

function setupMessageHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
        const autoReact = getSetting('AUTO_REACT') || 'on';
        if (autoReact === 'on') {
            try { await socket.sendPresenceUpdate('recording', msg.key.remoteJid); } catch (e) { }
        }
    });
}

// ═══════════════════════════════════════════════
// MAIN COMMAND HANDLER
// ═══════════════════════════════════════════════
function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        let command = null;
        let args = [];
        let sender = msg.key.remoteJid;

        const body = (msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption || '').trim();

        if (body.startsWith(config.PREFIX)) {
            const parts = body.slice(config.PREFIX.length).trim().split(/\s+/);
            command = parts[0].toLowerCase();
            args = parts.slice(1);
        } else if (msg.message.buttonsResponseMessage?.selectedButtonId) {
            const btnId = msg.message.buttonsResponseMessage.selectedButtonId;
            if (btnId.startsWith(config.PREFIX)) {
                const parts = btnId.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }

        if (!command) return;

        const text = args.join(' ');
        const prefix = config.PREFIX;

        const ownerNumbers = [config.OWNER_NUMBER + '@s.whatsapp.net', config.OWNER_NUMBER + '@c.us'];
        const isOwner = ownerNumbers.includes(sender) || msg.key.fromMe;
        const isGroup = sender.endsWith('@g.us');

        let groupMetadata = null;
        let isAdmin = false;
        let isBotAdmin = false;

        if (isGroup) {
            try {
                groupMetadata = await socket.groupMetadata(sender);
                const senderNum = sender.split('@')[0];
                isAdmin = groupMetadata.participants.some(p => (p.id?.split('@')[0] === senderNum || p.jid?.split('@')[0] === senderNum) && (p.admin === 'admin' || p.admin === 'superadmin'));
                if (isOwner) isAdmin = true;
                const botNum = socket.user.id.split(':')[0].split('@')[0];
                isBotAdmin = groupMetadata.participants.some(p => (p.id?.split('@')[0] === botNum || p.jid?.split('@')[0] === botNum) && (p.admin === 'admin' || p.admin === 'superadmin'));
            } catch (e) { }
        }

        if (botMode === 'private' && !isOwner && command) {
            return socket.sendMessage(sender, { text: "🔒 Private mode." }, { quoted: msg });
        }

        try {
            switch (command) {

                // ═══════ MENU ═══════
                case 'menu': {
                    const senderNumber = sender ? sender.split('@')[0] : 'User';
                    const now = new Date();
                    const hour = now.getHours();
                    const greeting = hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 17 ? "Good afternoon" : hour >= 17 && hour < 20 ? "Good evening" : "Good night";
                    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
                    let listText = `┌── ⌗ ʟᴏꜰᴛ-ᴏꜱꜱ ᴄᴏᴍᴍᴀɴᴅꜱ\n│\n`;
                    allCommands.forEach(cmd => { listText += `├• ${String(cmd.num).padStart(2)}. ${cmd.cmd}\n`; });
                    listText += `│\n└── ⌗ ${allCommands.length} commands available`;
                    await new ButtonV2(socket)
                        .setTitle(config.BOT_NAME)
                        .setSubtitle(`Online · ${timeStr}`)
                        .setBody(`${greeting}, @${senderNumber}\n${dateStr} · ${timeStr}\n\n${listText}`)
                        .setFooter(`┌─ USER ───\n│ Status: ${isOwner ? 'Owner' : 'User'}\n│ Runtime: ${runtime(process.uptime())}\n└─────────────`)
                        .setContextInfo({ mentionedJid: [sender] }).setMentions([sender])
                        .addButton("🟢 Alive", `${prefix}alive`).addButton("🙂 Loft", `${prefix}loft`)
                        .addButton("🏓 Ping", `${prefix}ping`).addButton("👑 Owner", `${prefix}owner`)
                        .send(sender, { quoted: msg });
                    break;
                }

                // ═══════ ALIVE ═══════
                case 'alive': {
                    await new ButtonV2(socket)
                        .setTitle('🟢 BOT ONLINE').setSubtitle('Status')
                        .setBody(`🟢 *ONLINE*\n⏰ ${runtime(process.uptime())}\n📅 ${new Date().toLocaleString()}`)
                        .setFooter(config.BOT_FOOTER)
                        .addButton("📋 MENU", `${prefix}menu`).addButton("🏓 Ping", `${prefix}ping`)
                        .send(sender, { quoted: msg });
                    break;
                }

                // ═══════ PING ═══════
                case 'ping': {
                    const start = Date.now();
                    await socket.sendPresenceUpdate('composing', sender);
                    const pingTime = Date.now() - start;
                    const os = require('os');
                    const totalMem = (os.totalmem() / 1073741824).toFixed(2);
                    const usedMem = (totalMem - (os.freemem() / 1073741824)).toFixed(2);
                    await new ButtonV2(socket)
                        .setTitle('🏓 PONG!').setSubtitle('Latency')
                        .setBody(`📡 ${pingTime}ms\n🕐 ${runtime(process.uptime())}\n💾 RAM: ${usedMem}/${totalMem}GB\n🧠 CPU: ${os.cpus().length} cores`)
                        .setFooter(config.BOT_FOOTER)
                        .addButton("📋 MENU", `${prefix}menu`).addButton("🟢 Alive", `${prefix}alive`)
                        .send(sender, { quoted: msg });
                    break;
                }

                // ═══════ OWNER ═══════
                case 'owner':
                case 'dev': {
                    await new ButtonV2(socket)
                        .setTitle('👑 OWNER').setSubtitle('Developer')
                        .setBody(`👑 *${config.OWNER_NUMBER}*\n\n🐦‍🔥 Contact for support`)
                        .setFooter(config.BOT_FOOTER)
                        .addButton("📋 MENU", `${prefix}menu`)
                        .send(sender, { quoted: msg });
                    break;
                }

                // ═══════ SCRIPT ═══════
                case 'sc':
                case 'script':
                case 'source': {
                    await new ButtonV2(socket)
                        .setTitle('📜 SCRIPT SOURCE').setSubtitle('Code')
                        .setBody(`📜 *Script Source*\n\nhttps://github.com/xmdloft23/loft-quantum\n\n© ${config.BOT_NAME}`)
                        .setFooter(config.BOT_FOOTER)
                        .addButton("📋 MENU", `${prefix}menu`).addUrlButton("🔗 GitHub", "https://github.com/xmdloft23")
                        .send(sender, { quoted: msg });
                    break;
                }

                // ═══════ GETCODE ═══════
                case 'getcode':
                case 'code':
                case 'viewcode': {
                    if (!isOwner) return socket.sendMessage(sender, { text: '❌ Owner only!' }, { quoted: msg });
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 *Usage:* ${prefix}${command} [filename]` }, { quoted: msg });
                    try {
                        let fileName = text.trim();
                        if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) return socket.sendMessage(sender, { text: '❌ Invalid filename!' }, { quoted: msg });
                        let fileNameWithExt = fileName.endsWith('.js') ? fileName : `${fileName}.js`;
                        const possiblePaths = [
                            path.join(process.cwd(), fileNameWithExt),
                            path.join(process.cwd(), 'commands', fileNameWithExt),
                            path.join(process.cwd(), 'loft', fileNameWithExt),
                            path.join(process.cwd(), 'system', fileNameWithExt),
                        ];
                        let filePath = null;
                        for (const p of possiblePaths) { if (fs.existsSync(p)) { filePath = p; break; } }
                        if (!filePath) return socket.sendMessage(sender, { text: `❌ File "${fileNameWithExt}" not found!` }, { quoted: msg });
                        const fileContent = fs.readFileSync(filePath, 'utf8');
                        const preview = fileContent.length > 3000 ? `${fileContent.slice(0, 3000)}\n\n... (trimmed)` : fileContent;
                        await socket.sendMessage(sender, {
                            text: `💻 *Code Viewer*\n\n📄 ${path.basename(filePath)}\n📊 ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB\n\n\`\`\`javascript\n${preview}\n\`\`\``
                        }, { quoted: msg });
                    } catch (e) { await socket.sendMessage(sender, { text: `❌ Error: ${e.message}` }, { quoted: msg }); }
                    break;
                }

                // ═══════ PUBLIC / PRIVATE ═══════
                case 'publicmode': {
                    if (!isOwner) return socket.sendMessage(sender, { text: '❌ Owner only' }, { quoted: msg });
                    botMode = 'public';
                    await socket.sendMessage(sender, { text: '🌐 Bot is now in *Public Mode*' }, { quoted: msg });
                    break;
                }
                case 'privatemode': {
                    if (!isOwner) return socket.sendMessage(sender, { text: '❌ Owner only' }, { quoted: msg });
                    botMode = 'private';
                    await socket.sendMessage(sender, { text: '🔒 Bot is now in *Private Mode*' }, { quoted: msg });
                    break;
                }

                // ═══════ JID ═══════
                case 'jid':
                case 'myid': {
                    await socket.sendMessage(sender, { text: `🆔 ${sender}` }, { quoted: msg });
                    break;
                }

                // ═══════ STATUS ═══════
                case 'status':
                case 'stats': {
                    const os = require('os');
                    const totalMem = (os.totalmem() / 1073741824).toFixed(2);
                    const usedMem = (totalMem - (os.freemem() / 1073741824)).toFixed(2);
                    await new ButtonV2(socket).setTitle('📊 STATUS').setSubtitle('Stats').setBody(`⏰ ${runtime(process.uptime())}\n💾 ${usedMem}/${totalMem}GB\n🧠 ${os.cpus().length}c\n🌐 ${botMode}`).setFooter(config.BOT_FOOTER).addButton("📋 MENU", `${prefix}menu`).send(sender, { quoted: msg });
                    break;
                }

                // ═══════ LOFT META ═══════
                case 'oss':
                case 'loftmeta':
                case 'meta': {
                    const os = require('os');
                    const totalMem = (os.totalmem() / 1073741824).toFixed(2);
                    const usedMem = (totalMem - (os.freemem() / 1073741824)).toFixed(2);
                    await new ButtonV2(socket)
                        .setTitle('📊 LOFT META').setSubtitle('System Info')
                        .setBody(`🖥️ ${os.platform()} ${os.arch()}\n🧠 ${os.cpus().length} cores\n💾 ${usedMem}/${totalMem}GB\n⏰ ${runtime(process.uptime())}\n🌐 ${botMode}\n👑 ${isOwner ? 'Owner' : 'User'}`)
                        .setFooter(config.BOT_FOOTER)
                        .addButton("📋 MENU", `${prefix}menu`)
                        .send(sender, { quoted: msg });
                    break;
                }

                // ═══════ PLAY ═══════
                case 'play':
                case 'ytmp3':
                case 'ytaudio':
                case 'yta': {
                    if (!text) return socket.sendMessage(sender, { text: `❌ .${command} [song name]` }, { quoted: msg });
                    try {
                        await socket.sendPresenceUpdate('recording', sender);
                        const results = await searchYouTube(text);
                        if (!results || results.length === 0) return socket.sendMessage(sender, { text: `❌ Song "${text}" not found!` }, { quoted: msg });
                        const result = results[0];
                        let audioData = null;
                        for (const endpoint of audioEndpoints) {
                            try {
                                const apiUrl = `${GIFTED_TECH_API}/api/download/${endpoint}?apikey=${GIFTED_API_KEY}&url=${encodeURIComponent(result.url)}`;
                                const res = await axios.get(apiUrl, { timeout: 30000 });
                                const dlUrl = res.data?.result?.download_url || res.data?.result?.url || res.data?.download_url || res.data?.url;
                                if (dlUrl) { audioData = { download_url: dlUrl, title: res.data?.result?.title || result.title, thumbnail: res.data?.result?.thumbnail || result.thumbnail, quality: res.data?.result?.quality || "128kbps" }; break; }
                            } catch (e) { continue; }
                        }
                        if (!audioData) return socket.sendMessage(sender, { text: "❌ Error downloading audio!" }, { quoted: msg });
                        await new ButtonV2(socket).setTitle('🎵 PLAY').setSubtitle(result.channel).setBody(`🎵 *${audioData.title}*\n🎤 ${result.channel}\n⏱️ ${result.duration}\n📀 ${audioData.quality}`).setFooter(config.BOT_FOOTER).addButton("📋 MENU", `${prefix}menu`).send(sender, { quoted: msg });
                        const audioBuffer = await ossBuffer(audioData.download_url);
                        if (isValidBuffer(audioBuffer)) {
                            const audio = await formatAudio(audioBuffer);
                            await socket.sendMessage(sender, { audio, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
                        } else {
                            await socket.sendMessage(sender, { text: "❌ Failed to get audio file" }, { quoted: msg });
                        }
                    } catch (e) { await socket.sendMessage(sender, { text: "❌ Error: " + e.message }, { quoted: msg }); }
                    break;
                }

                // ═══════ VIDEO ═══════
                case 'video':
                case 'ytmp4':
                case 'ytvideo':
                case 'ytv': {
                    if (!text) return socket.sendMessage(sender, { text: `❌ .${command} [title or URL]` }, { quoted: msg });
                    try {
                        await socket.sendPresenceUpdate('recording', sender);
                        let url = text, title = 'Video';
                        if (!text.includes("youtu")) {
                            const results = await searchYouTube(text);
                            if (!results || results.length === 0) return socket.sendMessage(sender, { text: "❌ Video not found!" }, { quoted: msg });
                            url = results[0].url; title = results[0].title;
                        }
                        let videoData = null;
                        for (const endpoint of videoEndpoints) {
                            try {
                                const apiUrl = `${GIFTED_TECH_API}/api/download/${endpoint}?apikey=${GIFTED_API_KEY}&url=${encodeURIComponent(url)}`;
                                const res = await axios.get(apiUrl, { timeout: 30000 });
                                const dlUrl = res.data?.result?.download_url || res.data?.result?.url || res.data?.download_url || res.data?.url;
                                if (dlUrl) { videoData = { download_url: dlUrl, title: res.data?.result?.title || title }; break; }
                            } catch (e) { continue; }
                        }
                        if (!videoData) return socket.sendMessage(sender, { text: "❌ Failed to download video!" }, { quoted: msg });
                        await socket.sendMessage(sender, { text: `🎥 *${videoData.title}*\n\n_📥 Downloading..._` }, { quoted: msg });
                        const videoBuffer = await ossBuffer(videoData.download_url);
                        if (isValidBuffer(videoBuffer)) {
                            await socket.sendMessage(sender, { video: videoBuffer, mimetype: 'video/mp4', caption: `🎥 ${videoData.title.substring(0, 50)}` }, { quoted: msg });
                        } else {
                            await socket.sendMessage(sender, { text: "❌ Failed to get video file" }, { quoted: msg });
                        }
                    } catch (e) { await socket.sendMessage(sender, { text: "❌ Error: " + e.message }, { quoted: msg }); }
                    break;
                }

                // ═══════ TOURL / CATBOX ═══════
                case 'tourl':
                case 'catbox': {
                    if (!msg.message.extendedTextMessage?.contextInfo?.quotedMessage) return socket.sendMessage(sender, { text: `🐦‍🔥 Reply to media with ${prefix}${command}` }, { quoted: msg });
                    try {
                        const quoted = msg.message.extendedTextMessage.contextInfo.quotedMessage;
                        const type = Object.keys(quoted).find(k => k.endsWith('Message'));
                        if (!type) return socket.sendMessage(sender, { text: '❌ Unsupported media!' }, { quoted: msg });
                        const stream = await downloadContentFromMessage(quoted[type], type.replace('Message', ''));
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                        const form = new FormData();
                        form.append('reqtype', 'fileupload');
                        form.append('fileToUpload', buffer, 'file');
                        const response = await axios.post('https://catbox.moe/user/api.php', form, { headers: { ...form.getHeaders() } });
                        const url = String(response.data).trim();
                        await socket.sendMessage(sender, { text: `📤 Uploaded!\n\n🔗 ${url}` }, { quoted: msg });
                    } catch (e) { await socket.sendMessage(sender, { text: `❌ Upload failed: ${e.message}` }, { quoted: msg }); }
                    break;
                }

                // ═══════ WAIFU ═══════
                case 'waifu':
                case 'bluearchive':
                case 'ba': {
                    try {
                        const response = await axios.get('https://api.nekolabs.my.id/random/blue-archive', { responseType: 'arraybuffer', timeout: 15000 });
                        const buffer = Buffer.from(response.data);
                        if (!buffer || buffer.length < 1024) throw new Error('Invalid image');
                        await socket.sendMessage(sender, { image: buffer, caption: '🌸 *Blue Archive Waifu*' }, { quoted: msg });
                    } catch (error) { await socket.sendMessage(sender, { text: `❌ Failed: ${error.message}` }, { quoted: msg }); }
                    break;
                }

                // ═══════ LOFT AI ═══════
                case 'loft':
                case 'ai': {
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}loft [question]` }, { quoted: msg });
                    try {
                        await socket.sendPresenceUpdate('composing', sender);
                        const response = await getLoftAIResponse(text);
                        if (!response) return socket.sendMessage(sender, { text: '❌ Error. Try again.' }, { quoted: msg });
                        await socket.sendMessage(sender, { text: `*You:* ${text}\n\n*LOFT:* ${response}` }, { quoted: msg });
                    } catch (e) { await socket.sendMessage(sender, { text: '❌ Sorry, error occurred.' }, { quoted: msg }); }
                    break;
                }

                // ═══════ VV ═══════
                case 'vv':
                case 'viewonce': {
                    if (!isOwner) return socket.sendMessage(sender, { text: '❌ Owner only!' }, { quoted: msg });
                    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quoted) return socket.sendMessage(sender, { text: '🐦‍🔥 Reply to a view-once!' }, { quoted: msg });
                    try {
                        let inner = quoted;
                        if (inner.viewOnceMessageV2) inner = inner.viewOnceMessageV2.message;
                        else if (inner.viewOnceMessage) inner = inner.viewOnceMessage.message;
                        const type = Object.keys(inner).find(k => k.endsWith('Message'));
                        if (!type) return socket.sendMessage(sender, { text: '❌ Invalid!' }, { quoted: msg });
                        const mediaType = type === 'videoMessage' ? 'video' : type === 'audioMessage' ? 'audio' : 'image';
                        const stream = await downloadContentFromMessage(inner[type], mediaType);
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                        if (type === 'imageMessage') await socket.sendMessage(sender, { image: buffer, caption: '📸 View Once' }, { quoted: msg });
                        else if (type === 'videoMessage') await socket.sendMessage(sender, { video: buffer, mimetype: 'video/mp4', caption: '🎥 View Once' }, { quoted: msg });
                        else if (type === 'audioMessage') await socket.sendMessage(sender, { audio: buffer, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
                    } catch (e) { await socket.sendMessage(sender, { text: `❌ Failed: ${e.message}` }, { quoted: msg }); }
                    break;
                }

                // ═══════ IMG ═══════
                case 'img': {
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}img description` }, { quoted: msg });
                    try {
                        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}`;
                        await socket.sendMessage(sender, { image: { url }, caption: `🖼️ ${text}` }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ STICKER ═══════
                case 'sticker':
                case 's': {
                    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quoted || (!quoted.imageMessage && !quoted.videoMessage)) return socket.sendMessage(sender, { text: '🐦‍🔥 Reply to image/video' }, { quoted: msg });
                    try {
                        const type = quoted.imageMessage ? 'imageMessage' : 'videoMessage';
                        const stream = await downloadContentFromMessage(quoted[type], quoted.imageMessage ? 'image' : 'video');
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                        const stickerBuffer = await writeExifImg(buffer, { packname: "LOFT", author: "OSS" });
                        await socket.sendMessage(sender, { sticker: stickerBuffer }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ QUOTE ═══════
                case 'quote': {
                    const quotes = ["Life is complicated. I killed people, smuggled people, sold people.", "All I have in this world is my balls and my word, and I don't break 'em for no one.", "Better to be king for a night than schmuck for a lifetime."];
                    await socket.sendMessage(sender, { text: `"${quotes[Math.floor(Math.random() * quotes.length)]}"\n\n- GTA V` }, { quoted: msg });
                    break;
                }

                // ═══════ EMOJIMIX ═══════
                case 'emojimix': {
                    if (!text || !text.includes('+')) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}emojimix 😎+😂` }, { quoted: msg });
                    try {
                        const [e1, e2] = text.split('+');
                        const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(e1 + e2)}&key=AIzaSyBg3o7q3G4dA8q8a3q8a3q8a3q8a3q8a3q8&limit=1`;
                        const res = await axios.get(url);
                        if (!res.data.results?.length) throw new Error();
                        await socket.sendMessage(sender, { image: { url: res.data.results[0].media_formats.gif.url }, caption: `${e1} + ${e2}` }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ CALC ═══════
                case 'calc':
                case 'calculate': {
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}calc 2+2` }, { quoted: msg });
                    try {
                        const result = Function('"use strict";return (' + text + ')')();
                        await socket.sendMessage(sender, { text: `🧮 ${text} = ${result}` }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Invalid' }, { quoted: msg }); }
                    break;
                }

                // ═══════ MEME ═══════
                case 'meme': {
                    try {
                        const res = await axios.get('https://meme-api.com/gimme');
                        await socket.sendMessage(sender, { image: { url: res.data.url }, caption: `😂 ${res.data.title}\nr/${res.data.subreddit}` }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ YTSEARCH ═══════
                case 'ytsearch': {
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}ytsearch query` }, { quoted: msg });
                    try {
                        const results = await searchYouTube(text);
                        if (!results) return socket.sendMessage(sender, { text: '❌ No results' }, { quoted: msg });
                        let resultText = '📺 *YouTube*\n\n';
                        results.slice(0, 5).forEach((v, i) => { resultText += `${i+1}. ${v.title.substring(0, 40)}\n⏱️ ${v.duration}\n🔗 ${v.url}\n\n`; });
                        await socket.sendMessage(sender, { text: resultText }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ NEWS ═══════
                case 'news': {
                    try {
                        const res = await axios.get('https://gnewsapi.com/v4/top-headlines?token=8a4e8b8c6d5f4a3b2c1d9e8f7a6b5c4d&lang=en&max=5');
                        if (!res.data?.articles) throw new Error();
                        let newsText = '📰 *News*\n\n';
                        res.data.articles.slice(0, 5).forEach((a, i) => { newsText += `${i+1}. ${a.title.substring(0, 50)}\n🐦‍🔥 ${a.source.name}\n\n`; });
                        await socket.sendMessage(sender, { text: newsText }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ SENDAUDIO ═══════
                case 'sendaudio':
                case 'dlmp3': {
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}sendaudio URL` }, { quoted: msg });
                    try {
                        const buffer = await ossBuffer(text);
                        if (!isValidBuffer(buffer)) throw new Error('Invalid');
                        await socket.sendMessage(sender, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ SENDVIDEO ═══════
                case 'sendvideo':
                case 'dlmp4': {
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}sendvideo URL` }, { quoted: msg });
                    try {
                        const buffer = await ossBuffer(text);
                        if (!isValidBuffer(buffer)) throw new Error('Invalid');
                        await socket.sendMessage(sender, { video: buffer, mimetype: 'video/mp4' }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ TIKTOK ═══════
                case 'tiktok':
                case 'tt': {
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}tiktok URL` }, { quoted: msg });
                    try {
                        const result = await queryGiftedAPI(text, tiktokEndpoints, 20000);
                        if (!result.success) throw new Error('Failed');
                        const buffer = await ossBuffer(result.download_url);
                        if (!isValidBuffer(buffer)) throw new Error('Invalid');
                        await socket.sendMessage(sender, { video: buffer, mimetype: 'video/mp4', caption: '📱 TikTok' }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ IG ═══════
                case 'ig':
                case 'instagram':
                case 'igdl': {
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}ig [URL]` }, { quoted: msg });
                    try {
                        if (!text.includes('instagram.com')) return socket.sendMessage(sender, { text: '❌ Invalid URL!' }, { quoted: msg });
                        const result = await queryGiftedAPI(text, igEndpoints, 20000);
                        if (!result.success) throw new Error('Failed');
                        const buffer = await ossBuffer(result.download_url);
                        const isVideo = result.download_url.includes('.mp4');
                        if (isVideo) await socket.sendMessage(sender, { video: buffer, mimetype: 'video/mp4', caption: '📸 Instagram' }, { quoted: msg });
                        else await socket.sendMessage(sender, { image: buffer, caption: '📸 Instagram' }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ FB ═══════
                case 'fb':
                case 'facebook':
                case 'fbdl': {
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}fb [URL]` }, { quoted: msg });
                    try {
                        if (!text.includes('facebook.com') && !text.includes('fb.watch')) return socket.sendMessage(sender, { text: '❌ Invalid URL!' }, { quoted: msg });
                        const result = await queryGiftedAPI(text, fbEndpoints, 20000);
                        if (!result.success) throw new Error('Failed');
                        const buffer = await ossBuffer(result.download_url);
                        await socket.sendMessage(sender, { video: buffer, mimetype: 'video/mp4', caption: '📘 Facebook' }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ TWITTER ═══════
                case 'twitter':
                case 'tw':
                case 'xdown': {
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}twitter URL` }, { quoted: msg });
                    try {
                        const result = await queryGiftedAPI(text, twitterEndpoints, 20000);
                        if (!result.success) throw new Error('Failed');
                        const buffer = await ossBuffer(result.download_url);
                        await socket.sendMessage(sender, { video: buffer, mimetype: 'video/mp4', caption: '🐦 X' }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ LYRICS ═══════
                case 'lyrics': {
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}lyrics song` }, { quoted: msg });
                    try {
                        const res = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(text.split(' ')[0])}/${encodeURIComponent(text)}`);
                        await socket.sendMessage(sender, { text: res.data.lyrics || '❌ Not found' }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Not found' }, { quoted: msg }); }
                    break;
                }

                // ═══════ ISLAMIC QUOTE ═══════
                case 'qouteislamic':
                case 'islamicquote': {
                    const quotes = ["And whoever relies upon Allah - then He is sufficient for him.", "Indeed, with hardship [will be] ease. (Quran 94:6)", "The best among you are those who have the best manners."];
                    await socket.sendMessage(sender, { text: `🕌 ${quotes[Math.floor(Math.random() * quotes.length)]}` }, { quoted: msg });
                    break;
                }

                // ═══════ CHRISTIAN QUOTE ═══════
                case 'qoutechristian':
                case 'christianquote': {
                    const quotes = ["For God so loved the world that he gave his one and only Son. (John 3:16)", "I can do all things through Christ who strengthens me. (Philippians 4:13)", "Trust in the Lord with all your heart. (Proverbs 3:5)"];
                    await socket.sendMessage(sender, { text: `✝️ ${quotes[Math.floor(Math.random() * quotes.length)]}` }, { quoted: msg });
                    break;
                }

                // ═══════ TEMPMAIL ═══════
                case 'tempmail':
                case 'newmail': {
                    try {
                        const res = await axios.get('https://api.mail.tm/domains');
                        const domain = res.data['hydra:member'][0].domain;
                        const email = `tmp_${Math.random().toString(36).substring(2, 8)}@${domain}`;
                        await socket.sendMessage(sender, { text: `📧 ${email}` }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ TAGALL ═══════
                case 'tagall':
                case 'everyone': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    const mentions = groupMetadata.participants.map(p => p.id);
                    await socket.sendMessage(sender, { text: `${text || '📢 Announcement'}\n\n${mentions.map(j => `@${j.split('@')[0]}`).join(' ')}`, mentions }, { quoted: msg });
                    break;
                }

                // ═══════ HIDETAG ═══════
                case 'hidetag':
                case 'htag': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    const mentions = groupMetadata.participants.map(p => p.id);
                    await socket.sendMessage(sender, { text: text || 'Hidden', mentions }, { quoted: msg });
                    break;
                }

                // ═══════ TAGADMINS ═══════
                case 'tagadmins': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    const admins = groupMetadata.participants.filter(p => p.admin).map(p => p.id);
                    if (!admins.length) return socket.sendMessage(sender, { text: '❌ No admins' }, { quoted: msg });
                    await socket.sendMessage(sender, { text: `${text || '👮 Admins'}\n\n${admins.map(j => `@${j.split('@')[0]}`).join(' ')}`, mentions: admins }, { quoted: msg });
                    break;
                }

                // ═══════ PROMOTE ═══════
                case 'promote': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isBotAdmin) return socket.sendMessage(sender, { text: '❌ Bot not admin' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    let user = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || msg.message.extendedTextMessage?.contextInfo?.participant;
                    if (!user && text) { const num = text.replace(/[^0-9]/g, ''); if (num.length >= 7) user = `${num}@s.whatsapp.net`; }
                    if (!user) return socket.sendMessage(sender, { text: '🐦‍🔥 Reply or tag user' }, { quoted: msg });
                    try { await socket.groupParticipantsUpdate(sender, [user], 'promote'); await socket.sendMessage(sender, { text: `✅ @${user.split('@')[0]} promoted` }, { quoted: msg }); }
                    catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ DEMOTE ═══════
                case 'demote': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isBotAdmin) return socket.sendMessage(sender, { text: '❌ Bot not admin' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    let user = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || msg.message.extendedTextMessage?.contextInfo?.participant;
                    if (!user && text) { const num = text.replace(/[^0-9]/g, ''); if (num.length >= 7) user = `${num}@s.whatsapp.net`; }
                    if (!user) return socket.sendMessage(sender, { text: '🐦‍🔥 Reply or tag user' }, { quoted: msg });
                    try { await socket.groupParticipantsUpdate(sender, [user], 'demote'); await socket.sendMessage(sender, { text: `⬇️ @${user.split('@')[0]} demoted` }, { quoted: msg }); }
                    catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ KICK ═══════
                case 'kick':
                case 'remove': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isBotAdmin) return socket.sendMessage(sender, { text: '❌ Bot not admin' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    let user = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || msg.message.extendedTextMessage?.contextInfo?.participant;
                    if (!user && text) { const num = text.replace(/[^0-9]/g, ''); if (num.length >= 7) user = `${num}@s.whatsapp.net`; }
                    if (!user) return socket.sendMessage(sender, { text: '🐦‍🔥 Reply or tag user' }, { quoted: msg });
                    if (user === sender) return socket.sendMessage(sender, { text: '❌ Cannot kick self' }, { quoted: msg });
                    try { await socket.groupParticipantsUpdate(sender, [user], 'remove'); await socket.sendMessage(sender, { text: `👢 @${user.split('@')[0]} kicked` }, { quoted: msg }); }
                    catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ ADD ═══════
                case 'add':
                case 'invite': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isBotAdmin) return socket.sendMessage(sender, { text: '❌ Bot not admin' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}add 255...` }, { quoted: msg });
                    const num = text.replace(/[^0-9]/g, '');
                    if (num.length < 7) return socket.sendMessage(sender, { text: '❌ Invalid number' }, { quoted: msg });
                    try { await socket.groupParticipantsUpdate(sender, [`${num}@s.whatsapp.net`], 'add'); await socket.sendMessage(sender, { text: `✅ @${num} added` }, { quoted: msg }); }
                    catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ MUTE ═══════
                case 'mute':
                case 'close':
                case 'groupmute': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isBotAdmin) return socket.sendMessage(sender, { text: '❌ Bot not admin' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    await socket.groupSettingUpdate(sender, 'announcement');
                    await socket.sendMessage(sender, { text: '🔇 Muted' }, { quoted: msg });
                    break;
                }

                // ═══════ UNMUTE ═══════
                case 'unmute':
                case 'open': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isBotAdmin) return socket.sendMessage(sender, { text: '❌ Bot not admin' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    await socket.groupSettingUpdate(sender, 'not_announcement');
                    await socket.sendMessage(sender, { text: '🔊 Unmuted' }, { quoted: msg });
                    break;
                }

                // ═══════ LINK ═══════
                case 'link':
                case 'gclink': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isBotAdmin) return socket.sendMessage(sender, { text: '❌ Bot not admin' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    try { const code = await socket.groupInviteCode(sender); await socket.sendMessage(sender, { text: `🔗 https://chat.whatsapp.com/${code}` }, { quoted: msg }); }
                    catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ RESETLINK ═══════
                case 'resetlink':
                case 'revoke': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isBotAdmin) return socket.sendMessage(sender, { text: '❌ Bot not admin' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    try { await socket.groupRevokeInvite(sender); const code = await socket.groupInviteCode(sender); await socket.sendMessage(sender, { text: `🔄 https://chat.whatsapp.com/${code}` }, { quoted: msg }); }
                    catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ GROUP NAME ═══════
                case 'groupname':
                case 'gcname': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isBotAdmin) return socket.sendMessage(sender, { text: '❌ Bot not admin' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}groupname name` }, { quoted: msg });
                    await socket.groupUpdateSubject(sender, text);
                    await socket.sendMessage(sender, { text: `✅ Name: ${text}` }, { quoted: msg });
                    break;
                }

                // ═══════ GC DESC ═══════
                case 'gcdesc':
                case 'groupdesc': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isBotAdmin) return socket.sendMessage(sender, { text: '❌ Bot not admin' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}gcdesc description` }, { quoted: msg });
                    await socket.groupUpdateDescription(sender, text);
                    await socket.sendMessage(sender, { text: '✅ Description updated' }, { quoted: msg });
                    break;
                }

                // ═══════ MET ═══════
                case 'met':
                case 'groupinfo': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    try {
                        const g = groupMetadata;
                        const ownerJid = g.owner || g.id.split('@')[0];
                        await socket.sendMessage(sender, { text: `🐦‍🔥 *${g.subject || 'Group'}*\n👥 ${g.participants.length} members\n👑 @${ownerJid.split('@')[0]}\n📅 ${new Date(g.creation * 1000).toLocaleDateString()}` }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ ONLINE ═══════
                case 'online':
                case 'listonline': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    const online = [];
                    const presenceMap = new Map();
                    const listener = (update) => {
                        if (update.presences) {
                            for (const [jid, p] of Object.entries(update.presences)) {
                                if (['available', 'composing', 'recording'].includes(p.lastKnownPresence)) presenceMap.set(jid, p);
                            }
                        }
                    };
                    socket.ev.on('presence.update', listener);
                    try {
                        for (const p of groupMetadata.participants) { try { await socket.presenceSubscribe(p.id); } catch { } }
                        await new Promise(r => setTimeout(r, 1500));
                        for (const p of groupMetadata.participants) { if (presenceMap.has(p.id)) online.push(p.id); }
                        socket.ev.off('presence.update', listener);
                        if (!online.length) return socket.sendMessage(sender, { text: '😴 No online' }, { quoted: msg });
                        await socket.sendMessage(sender, { text: `🟢 ${online.length} online\n\n${online.map(j => `@${j.split('@')[0]}`).join(' ')}`, mentions: online }, { quoted: msg });
                    } catch { socket.ev.off('presence.update', listener); await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ NEWGROUP ═══════
                case 'newgroup':
                case 'newgc': {
                    if (!isOwner) return socket.sendMessage(sender, { text: '❌ Owner only' }, { quoted: msg });
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}newgroup name` }, { quoted: msg });
                    try { const group = await socket.groupCreate(text, [sender]); await socket.sendMessage(sender, { text: `✅ ${text}\n🆔 ${group.id}` }, { quoted: msg }); }
                    catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ LEFT ═══════
                case 'left':
                case 'leave': {
                    if (!isOwner) return socket.sendMessage(sender, { text: '❌ Owner only' }, { quoted: msg });
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    await socket.sendMessage(sender, { text: '👋 Leaving...' }, { quoted: msg });
                    await new Promise(r => setTimeout(r, 1000));
                    await socket.groupLeave(sender);
                    break;
                }

                // ═══════ VCF ═══════
                case 'vcf':
                case 'contacts': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    try {
                        const participants = groupMetadata?.participants || [];
                        if (!participants.length) return socket.sendMessage(sender, { text: '❌ No members' }, { quoted: msg });
                        let vcf = '', count = 0;
                        for (const member of participants) {
                            const jid = member.id || member.jid;
                            if (!jid || !jid.includes('@s.whatsapp.net')) continue;
                            const id = jid.split('@')[0];
                            vcf += `BEGIN:VCARD\nVERSION:3.0\nFN:[${++count}] +${id}\nTEL;waid=${id}:+${id}\nEND:VCARD\n`;
                        }
                        if (!count) return socket.sendMessage(sender, { text: '❌ No contacts' }, { quoted: msg });
                        await socket.sendMessage(sender, { document: Buffer.from(vcf.trim(), 'utf-8'), mimetype: 'text/vcard', fileName: 'contacts.vcf', caption: `📇 ${count} contacts` }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ LIST REQUESTS ═══════
                case 'listrequests':
                case 'joinrequests': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isBotAdmin) return socket.sendMessage(sender, { text: '❌ Bot not admin' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    try {
                        const pending = await socket.groupRequestParticipantsList(sender);
                        if (!pending || !pending.length) return socket.sendMessage(sender, { text: '📭 No requests' }, { quoted: msg });
                        await socket.sendMessage(sender, { text: `📋 ${pending.length} requests\n\n${pending.map((r, i) => `${i+1}. @${r.jid.split('@')[0]}`).join('\n')}`, mentions: pending.map(r => r.jid) }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ ACCEPT ═══════
                case 'accept':
                case 'approve': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isBotAdmin) return socket.sendMessage(sender, { text: '❌ Bot not admin' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}accept 255...` }, { quoted: msg });
                    const num = text.replace(/[^0-9]/g, '');
                    if (num.length < 7) return socket.sendMessage(sender, { text: '❌ Invalid' }, { quoted: msg });
                    try { await socket.groupRequestParticipantsUpdate(sender, [`${num}@s.whatsapp.net`], 'approve'); await socket.sendMessage(sender, { text: `✅ @${num} accepted` }, { quoted: msg }); }
                    catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ REJECT ═══════
                case 'reject':
                case 'decline': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isBotAdmin) return socket.sendMessage(sender, { text: '❌ Bot not admin' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}reject 255...` }, { quoted: msg });
                    const num = text.replace(/[^0-9]/g, '');
                    if (num.length < 7) return socket.sendMessage(sender, { text: '❌ Invalid' }, { quoted: msg });
                    try { await socket.groupRequestParticipantsUpdate(sender, [`${num}@s.whatsapp.net`], 'reject'); await socket.sendMessage(sender, { text: `❌ @${num} rejected` }, { quoted: msg }); }
                    catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ ACCEPT ALL ═══════
                case 'acceptall':
                case 'approveall': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isBotAdmin) return socket.sendMessage(sender, { text: '❌ Bot not admin' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    try {
                        const pending = await socket.groupRequestParticipantsList(sender);
                        if (!pending || !pending.length) return socket.sendMessage(sender, { text: '📭 No requests' }, { quoted: msg });
                        await socket.groupRequestParticipantsUpdate(sender, pending.map(r => r.jid), 'approve');
                        await socket.sendMessage(sender, { text: `✅ ${pending.length} accepted` }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ REJECT ALL ═══════
                case 'rejectall':
                case 'declineall': {
                    if (!isGroup) return socket.sendMessage(sender, { text: '❌ Groups only' }, { quoted: msg });
                    if (!isBotAdmin) return socket.sendMessage(sender, { text: '❌ Bot not admin' }, { quoted: msg });
                    if (!isAdmin && !isOwner) return socket.sendMessage(sender, { text: '❌ Admin only' }, { quoted: msg });
                    try {
                        const pending = await socket.groupRequestParticipantsList(sender);
                        if (!pending || !pending.length) return socket.sendMessage(sender, { text: '📭 No requests' }, { quoted: msg });
                        await socket.groupRequestParticipantsUpdate(sender, pending.map(r => r.jid), 'reject');
                        await socket.sendMessage(sender, { text: `❌ ${pending.length} rejected` }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ ONWA ═══════
                case 'onwa':
                case 'checknumber': {
                    if (!text) return socket.sendMessage(sender, { text: `🐦‍🔥 ${prefix}onwa 255...` }, { quoted: msg });
                    const num = text.replace(/[^0-9]/g, '');
                    if (num.length < 7) return socket.sendMessage(sender, { text: '❌ Invalid number' }, { quoted: msg });
                    try {
                        const [result] = await socket.onWhatsApp(num);
                        await socket.sendMessage(sender, { text: result?.exists ? `✅ ${num} on WhatsApp` : `❌ ${num} not on WhatsApp` }, { quoted: msg });
                    } catch { await socket.sendMessage(sender, { text: '❌ Failed' }, { quoted: msg }); }
                    break;
                }

                // ═══════ PAIR ═══════
                case 'pair': {
                    const numToPair = (text || '').replace(/[^0-9]/g, '');
                    if (!numToPair || numToPair.length < 10) return socket.sendMessage(sender, { text: `❌ *Usage:* .pair +255XXXXXXXXX` }, { quoted: msg });
                    try {
                        const response = await axios.get(`http://206.189.94.231:8000/code?number=${encodeURIComponent(numToPair)}`, { timeout: 15000 });
                        if (!response.data || !response.data.code) throw new Error('Invalid response');
                        await socket.sendMessage(sender, { text: `✅ *Pairing Successful*\n\n🔑 *Code:* ${response.data.code}\n\n_📱 Enter in WhatsApp > Linked Devices_` }, { quoted: msg });
                    } catch (err) {
                        let errMsg = '⚠️ Failed to get pairing code.';
                        if (err.code === 'ECONNABORTED') errMsg = '⚠️ Request timed out.';
                        else if (err.response?.status >= 500) errMsg = '⚠️ Server error.';
                        else if (['ENOTFOUND', 'ECONNREFUSED'].includes(err.code)) errMsg = '⚠️ Cannot reach service.';
                        await socket.sendMessage(sender, { text: errMsg }, { quoted: msg });
                    }
                    break;
                }

                // ═══════ EVAL ═══════
                default:
                    if (body.startsWith('=>') && isOwner) {
                        try {
                            let evaled = await eval(`(async () => { ${body.slice(3)} })()`);
                            if (typeof evaled !== 'string') evaled = util.inspect(evaled);
                            await socket.sendMessage(sender, { text: String(evaled).substring(0, 4000) }, { quoted: msg });
                        } catch (err) {
                            await socket.sendMessage(sender, { text: String(err) }, { quoted: msg });
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('Command handler error:', error);
            await socket.sendMessage(sender, { text: `❌ Error: ${error.message}` }, { quoted: msg });
        }
    });
}

// ═══════════════════════════════════════════════
// SESSION RESTORE / CONFIG
// ═══════════════════════════════════════════════
async function deleteSessionFromGitHub(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({ owner, repo, path: 'session' });
        const sessionFiles = data.filter(file => file.name.includes(sanitizedNumber) && file.name.endsWith('.json'));
        for (const file of sessionFiles) {
            await octokit.repos.deleteFile({ owner, repo, path: `session/${file.name}`, message: `Delete ${sanitizedNumber}`, sha: file.sha });
        }
    } catch (error) { }
}

async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({ owner, repo, path: 'session' });
        const sessionFiles = data.filter(file => file.name === `creds_${sanitizedNumber}.json`);
        if (sessionFiles.length === 0) return null;
        const { data: fileData } = await octokit.repos.getContent({ owner, repo, path: `session/${sessionFiles[0].name}` });
        return JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));
    } catch (error) { return null; }
}

async function loadUserConfig(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({ owner, repo, path: `session/config_${sanitizedNumber}.json` });
        return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
    } catch (error) {
        return { ...config };
    }
}

async function updateUserConfig(number, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const configPath = `session/config_${sanitizedNumber}.json`;
        let sha;
        try {
            const { data } = await octokit.repos.getContent({ owner, repo, path: configPath });
            sha = data.sha;
        } catch (error) { }
        await octokit.repos.createOrUpdateFileContents({
            owner, repo, path: configPath,
            message: `Update config ${sanitizedNumber}`,
            content: Buffer.from(JSON.stringify(newConfig, null, 2)).toString('base64'),
            sha
        });
    } catch (error) { throw error; }
}

// ═══════════════════════════════════════════════
// AUTO RESTART
// ═══════════════════════════════════════════════
function setupAutoRestart(socket, number) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
            await delay(10000);
            activeSockets.delete(number.replace(/[^0-9]/g, ''));
            socketCreationTime.delete(number.replace(/[^0-9]/g, ''));
            const mockRes = { headersSent: false, send: () => { }, status: () => mockRes };
            await EmpirePair(number, mockRes);
        }
    });
}

// ═══════════════════════════════════════════════
// MAIN PAIRING FUNCTION
// ═══════════════════════════════════════════════
async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    try {
        await initUserEnvIfMissing(sanitizedNumber);
        await initEnvsettings(sanitizedNumber);
    } catch (e) { }

    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    await cleanDuplicateFiles(sanitizedNumber);

    const restoredCreds = await restoreSession(sanitizedNumber);
    if (restoredCreds) {
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(restoredCreds, null, 2));
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: 'fatal' });

    try {
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.windows('Chrome')
        });

        socketCreationTime.set(sanitizedNumber, Date.now());

        setupStatusHandlers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupMessageHandlers(socket);
        setupAutoRestart(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            let retries = 3;
            let code;
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber);
                    break;
                } catch (error) {
                    retries--;
                    await delay(2000);
                }
            }
            if (!res.headersSent) res.send({ code });
        }

        socket.ev.on('creds.update', async () => {
            await saveCreds();
            const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
            let sha;
            try {
                const { data } = await octokit.repos.getContent({ owner, repo, path: `session/creds_${sanitizedNumber}.json` });
                sha = data.sha;
            } catch (error) { }
            await octokit.repos.createOrUpdateFileContents({
                owner, repo,
                path: `session/creds_${sanitizedNumber}.json`,
                message: `Update creds ${sanitizedNumber}`,
                content: Buffer.from(fileContent).toString('base64'),
                sha
            });
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                try {
                    await delay(3000);
                    const userJid = jidNormalizedUser(socket.user.id);
                    activeSockets.set(sanitizedNumber, socket);

                    await socket.sendMessage(userJid, {
                        image: { url: config.IMAGE_PATH },
                        caption: formatMessage(
                            `*${config.BOT_NAME}*`,
                            `✅ Connected!\n\n🔢 ${sanitizedNumber}\n\n📋 Commands:\n${config.PREFIX}menu\n${config.PREFIX}alive\n${config.PREFIX}play\n${config.PREFIX}video\n${config.PREFIX}pair`,
                            config.BOT_FOOTER
                        )
                    });

                    let numbers = [];
                    if (fs.existsSync(NUMBER_LIST_PATH)) {
                        numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
                    }
                    if (!numbers.includes(sanitizedNumber)) {
                        numbers.push(sanitizedNumber);
                        fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
                    }
                } catch (error) {
                    console.error('Connection error:', error.message);
                }
            }
        });
    } catch (error) {
        console.error('Pairing error:', error.message);
        socketCreationTime.delete(sanitizedNumber);
        if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
    }
}

// ═══════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════
router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).send({ error: 'Number required' });
    if (activeSockets.has(number.replace(/[^0-9]/g, ''))) {
        return res.status(200).send({ status: 'already_connected', message: 'Already connected' });
    }
    await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
    res.status(200).send({ count: activeSockets.size, numbers: Array.from(activeSockets.keys()) });
});

router.get('/ping', (req, res) => {
    res.status(200).send({ status: 'active', message: 'Bot is running', activesession: activeSockets.size });
});

router.get('/connect-all', async (req, res) => {
    try {
        if (!fs.existsSync(NUMBER_LIST_PATH)) return res.status(404).send({ error: 'No numbers' });
        const numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH));
        const results = [];
        for (const number of numbers) {
            if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
            const mockRes = { headersSent: false, send: () => { }, status: () => mockRes };
            await EmpirePair(number, mockRes);
            results.push({ number, status: 'connection_initiated' });
        }
        res.status(200).send({ status: 'success', connections: results });
    } catch (error) { res.status(500).send({ error: 'Failed' }); }
});

router.get('/reconnect', async (req, res) => {
    try {
        const { data } = await octokit.repos.getContent({ owner, repo, path: 'session' });
        const sessionFiles = data.filter(file => file.name.startsWith('creds_') && file.name.endsWith('.json'));
        if (sessionFiles.length === 0) return res.status(404).send({ error: 'No sessions' });
        const results = [];
        for (const file of sessionFiles) {
            const match = file.name.match(/creds_(\d+)\.json/);
            if (!match) continue;
            const number = match[1];
            if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
            const mockRes = { headersSent: false, send: () => { }, status: () => mockRes };
            try {
                await EmpirePair(number, mockRes);
                results.push({ number, status: 'connection_initiated' });
            } catch (error) {
                results.push({ number, status: 'failed', error: error.message });
            }
            await delay(1000);
        }
        res.status(200).send({ status: 'success', connections: results });
    } catch (error) { res.status(500).send({ error: 'Failed' }); }
});

router.get('/update-config', async (req, res) => {
    const { number, config: configString } = req.query;
    if (!number || !configString) return res.status(400).send({ error: 'Number and config required' });
    let newConfig;
    try { newConfig = JSON.parse(configString); } catch (error) { return res.status(400).send({ error: 'Invalid config' }); }
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) return res.status(404).send({ error: 'No active session' });
    const otp = generateOTP();
    otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });
    try {
        await sendOTP(socket, sanitizedNumber, otp);
        res.status(200).send({ status: 'otp_sent' });
    } catch (error) {
        otpStore.delete(sanitizedNumber);
        res.status(500).send({ error: 'Failed to send OTP' });
    }
});

router.get('/verify-otp', async (req, res) => {
    const { number, otp } = req.query;
    if (!number || !otp) return res.status(400).send({ error: 'Number and OTP required' });
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const storedData = otpStore.get(sanitizedNumber);
    if (!storedData) return res.status(400).send({ error: 'No OTP request' });
    if (Date.now() >= storedData.expiry) { otpStore.delete(sanitizedNumber); return res.status(400).send({ error: 'Expired' }); }
    if (storedData.otp !== otp) return res.status(400).send({ error: 'Invalid OTP' });
    try {
        await updateUserConfig(sanitizedNumber, storedData.newConfig);
        otpStore.delete(sanitizedNumber);
        res.status(200).send({ status: 'success' });
    } catch (error) { res.status(500).send({ error: 'Failed' }); }
});

router.get('/getabout', async (req, res) => {
    const { number, target } = req.query;
    if (!number || !target) return res.status(400).send({ error: 'Number and target required' });
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) return res.status(404).send({ error: 'No active session' });
    const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    try {
        const statusData = await socket.fetchStatus(targetJid);
        res.status(200).send({ status: 'success', number: target, about: statusData.status || 'No status', setAt: statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown' });
    } catch (error) {
        res.status(500).send({ status: 'error', message: 'Failed to fetch status' });
    }
});

// ═══════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    exec(`pm2 restart ${process.env.PM2_NAME || 'BOT-session'}`);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});

module.exports = router;