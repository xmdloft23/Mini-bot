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
const yts = require("yt-search");
const fetch = require("node-fetch"); 
const api = `https://api-dark-shan-yt.koyeb.app`;
const apikey = `1c5502363449511f`;
const { initUserEnvIfMissing } = require('./settingsdb');
const { initEnvsettings, getSetting } = require('./settings');
//=======================================
const autoReact = getSetting('AUTO_REACT')|| 'on';

//=======================================
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    proto,
    prepareWAMessageMedia,
    generateWAMessageFromContent
} = require('@whiskeysockets/baileys');
//=======================================
const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['🧩', '🍉', '💜', '🌸', '🪴', '💊', '💫', '🍂', '🌟', '🎋', '😶‍🌫️', '🫀', '🧿', '👀', '🇹🇿', '🚩', '🥰', '🗿', '💜', '💙', '🌝', '🖤', '💚'],
    PREFIX: '.',
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/G3ChQEjwrdVBTBUQHWSNHF?mode=ems_copy_t',
    ADMIN_LIST_PATH: './admin.json',
    IMAGE_PATH: 'https://files.catbox.moe/2x9ktu.png',
    NEWSLETTER_JID: '120363398106360290@newsletter',
    NEWSLETTER_MESSAGE_ID: '0088',
    OTP_EXPIRY: 300000,
    NEWS_JSON_URL: '',
    BOT_NAME: '☭𝙻𝙾𝙵𝚃-𝚀𝚄𝙰𝙽𝚃𝚄m☭',
    OWNER_NAME: '𝙻𝚘𝚏𝚝',
    OWNER_NUMBER: '255778018545',
    BOT_VERSION: '1.0.0',
    BOT_FOOTER: '> 𝚙𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚂𝚒𝚛 𝙻𝙾𝙵𝚃',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb6B9xFCxoAseuG1g610',
    BUTTON_IMAGES: {
        ALIVE: 'https://files.catbox.moe/prrvct.png',
        MENU: 'https://files.catbox.moe/2x9ktu.png',
        OWNER: 'https://files.catbox.moe/prrvct.png',
        SONG: 'https://files.catbox.moe/2x9ktu.png',
        VIDEO: 'https://files.catbox.moe/prrvct.png'
    }
};

// List Message Generator
function generateListMessage(text, buttonTitle, sections) {
    return {
        text: text,
        footer: config.BOT_FOOTER,
        title: buttonTitle,
        buttonText: "ꜱᴇʟᴇᴄᴛ",
        sections: sections
    };
}
//=======================================
// Button Message Generator with Image Support
function generateButtonMessage(content, buttons, image = null) {
    const message = {
        text: content,
        footer: config.BOT_FOOTER,
        buttons: buttons,
        headerType: 1 // Default to text header
    };
//=======================================
    // Add image if provided
    if (image) {
        message.headerType = 4; // Image header
        message.image = typeof image === 'string' ? { url: image } : image;
    }

    return message;
}
//=======================================
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});
const owner = process.env.GITHUB_REPO_OWNER;
const repo = process.env.GITHUB_REPO_NAME;

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';
const otpStore = new Map();

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}
//=======================================
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
function formatMessage(title, content, footer) {
    return `${title}\n\n${content}\n\n${footer}`;
}
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}
async function cleanDuplicateFiles(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file => 
            file.name.startsWith(`empire_${sanitizedNumber}_`) && file.name.endsWith('.json')
        ).sort((a, b) => {
            const timeA = parseInt(a.name.match(/empire_\d+_(\d+)\.json/)?.[1] || 0);
            const timeB = parseInt(b.name.match(/empire_\d+_(\d+)\.json/)?.[1] || 0);
            return timeB - timeA;
        });

        const configFiles = data.filter(file => 
            file.name === `config_${sanitizedNumber}.json`
        );

        if (sessionFiles.length > 1) {
            for (let i = 1; i < sessionFiles.length; i++) {
                await octokit.repos.deleteFile({
                    owner,
                    repo,
                    path: `session/${sessionFiles[i].name}`,
                    message: `Delete duplicate session file for ${sanitizedNumber}`,
                    sha: sessionFiles[i].sha
                });
                console.log(`Deleted duplicate session file: ${sessionFiles[i].name}`);
            }
        }

        if (configFiles.length > 1) {
            console.log(`Config file for ${sanitizedNumber} already exists`);
        }
    } catch (error) {
        console.error(`Failed to clean duplicate files for ${number}:`, error);
    }
}
//=======================================

async function oneViewmeg(socket, isOwner, msg ,sender) {
    if (isOwner) {  
    try {
    const akuru = sender
    const quot = msg
    if (quot) {
        if (quot.imageMessage?.viewOnce) {
            console.log("hi");
            let cap = quot.imageMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.imageMessage);
            await socket.sendMessage(akuru, { image: { url: anu }, caption: cap });
        } else if (quot.videoMessage?.viewOnce) {
            console.log("hi");
            let cap = quot.videoMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.videoMessage);
             await socket.sendMessage(akuru, { video: { url: anu }, caption: cap });
        } else if (quot.audioMessage?.viewOnce) {
            console.log("hi");
            let cap = quot.audioMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.audioMessage);
             await socket.sendMessage(akuru, { audio: { url: anu }, caption: cap });
        } else if (quot.viewOnceMessageV2?.message?.imageMessage){
        
            let cap = quot.viewOnceMessageV2?.message?.imageMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.viewOnceMessageV2.message.imageMessage);
             await socket.sendMessage(akuru, { image: { url: anu }, caption: cap });
            
        } else if (quot.viewOnceMessageV2?.message?.videoMessage){
        
            let cap = quot.viewOnceMessageV2?.message?.videoMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.viewOnceMessageV2.message.videoMessage);
            await socket.sendMessage(akuru, { video: { url: anu }, caption: cap });

        } else if (quot.viewOnceMessageV2Extension?.message?.audioMessage){
        
            let cap = quot.viewOnceMessageV2Extension?.message?.audioMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.viewOnceMessageV2Extension.message.audioMessage);
            await socket.sendMessage(akuru, { audio: { url: anu }, caption: cap });
        }
        }        
        } catch (error) {
      }
    }

}

async function joinGroup(socket) {
    let retries = config.MAX_RETRIES;
    const inviteCodeMatch = config.GROUP_INVITE_LINK.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
    if (!inviteCodeMatch) {
        console.error('Invalid group invite link format');
        return { status: 'failed', error: 'Invalid group invite link' };
    }
    const inviteCode = inviteCodeMatch[1];

    while (retries > 0) {
        try {
            const response = await socket.groupAcceptInvite(inviteCode);
            if (response?.gid) {
                console.log(`Successfully joined group with ID: ${response.gid}`);
                return { status: 'success', gid: response.gid };
            }
            throw new Error('No group ID in response');
        } catch (error) {
            retries--;
            let errorMessage = error.message || 'Unknown error';
            if (error.message.includes('not-authorized')) {
                errorMessage = 'Bot is not authorized to join (possibly banned)';
            } else if (error.message.includes('conflict')) {
                errorMessage = 'Bot is already a member of the group';
            } else if (error.message.includes('gone')) {
                errorMessage = 'Group invite link is invalid or expired';
            }
            console.warn(`Failed to join group, retries left: ${retries}`, errorMessage);
            if (retries === 0) {
                return { status: 'failed', error: errorMessage };
            }
            await delay(2000 * (config.MAX_RETRIES - retries));
        }
    }
    return { status: 'failed', error: 'Max retries reached' };
}
//=======================================
async function sendAdminConnectMessage(socket, number, groupResult) {
    const admins = loadAdmins();
    const groupStatus = groupResult.status === 'success'
        ? `Joined (ID: ${groupResult.gid})`
        : `Failed to join group: ${groupResult.error}`;
    const caption = formatMessage(
        '*Connected Successful ✅*',
        `📞 Number: ${number}\n❤️ Status: Online`,
        `${config.BOT_FOOTER}`
    );

    for (const admin of admins) {
        try {
            await socket.sendMessage(
                `${admin}@s.whatsapp.net`,
                {
                    image: { url: config.IMAGE_PATH },
                    caption
                }
            );
        } catch (error) {
            console.error(`Failed to send connect message to admin ${admin}:`, error);
        }
    }
}
//=======================================
async function sendOTP(socket, number, otp) {
    const userJid = jidNormalizedUser(socket.user.id);
    const message = formatMessage(
        '"🔐 OTP VERIFICATION*',
        `Your OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.`,
        `${config.BOT_FOOTER}`
    );

    try {
        await socket.sendMessage(userJid, { text: message });
        console.log(`OTP ${otp} sent to ${number}`);
    } catch (error) {
        console.error(`Failed to send OTP to ${number}:`, error);
        throw error;
    }
}
//=======================================
function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== config.NEWSLETTER_JID) return;

        try {
            const emojis = ['❤️'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.newsletterServerId;

            if (!messageId) {
                console.warn('No valid newsletterServerId found:', message);
                return;
            }

            let retries = config.MAX_RETRIES;
            while (retries > 0) {
                try {
                    await socket.newsletterReactMessage(
                        config.NEWSLETTER_JID,
                        messageId.toString(),
                        randomEmoji
                    );
                    console.log(`Reacted to newsletter message ${messageId} with ${randomEmoji}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`Failed to react to newsletter message ${messageId}, retries left: ${retries}`, error.message);
                    if (retries === 0) throw error;
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
        } catch (error) {
            console.error('Newsletter reaction error:', error);
        }
    });
}
//=======================================
async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant || message.key.remoteJid === config.NEWSLETTER_JID) return;

        try {
            if (autoReact === 'on' && message.key.remoteJid) {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }

            if (config.AUTO_VIEW_STATUS === 'true') {
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.readMessages([message.key]);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to read status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }

            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { react: { text: randomEmoji, key: message.key } },
                            { statusJidList: [message.key.participant] }
                        );
                        console.log(`Reacted to status with ${randomEmoji}`);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to react to status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }
        } catch (error) {
            console.error('Status handler error:', error);
        }
    });
}
//=======================================
async function handleMessageRevocation(socket, number) {
    socket.ev.on('messages.delete', async ({ keys }) => {
        if (!keys || keys.length === 0) return;

        const messageKey = keys[0];
        const userJid = jidNormalizedUser(socket.user.id);
        const deletionTime = getSriLankaTimestamp();

        const message = formatMessage(
            '╭──◯',
            `✖ \`D E L E T E\`\n✖ *⦁ From :* ${messageKey.remoteJid}\n✖ *⦁ Time:* ${deletionTime}\n✖ *⦁ Type: Normal*\n╰──◯`,
            `${config.BOT_FOOTER}`
        );

        try {
            await socket.sendMessage(userJid, {
                image: { url: config.IMAGE_PATH },
                caption: message
            });
            console.log(`Notified ${number} about message deletion: ${messageKey.id}`);
        } catch (error) {
            console.error('Failed to send deletion notification:', error);
        }
    });
}
// Image resizing function
async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    let kiyomasa = await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
    return kiyomasa;
}

// Capitalize first letter
function capital(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Generate serial
const createSerial = (size) => {
    return crypto.randomBytes(size).toString('hex').slice(0, size);
}

// Send slide with news items
async function SendSlide(socket, jid, newsItems) {
    let anu = [];
    for (let item of newsItems) {
        let imgBuffer;
        try {
            imgBuffer = await resize(item.thumbnail, 300, 200);
        } catch (error) {
            console.error(`Failed to resize image for ${item.title}:`, error);
            imgBuffer = await Jimp.read('https://files.catbox.moe/bupsfv.jpg');
            imgBuffer = await imgBuffer.resize(300, 200).getBufferAsync(Jimp.MIME_JPEG);
        }
        let imgsc = await prepareWAMessageMedia({ image: imgBuffer }, { upload: socket.waUploadToServer });
        anu.push({
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: `*${capital(item.title)}*\n\n${item.body}`
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                hasMediaAttachment: true,
                ...imgsc
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: [
                    {
                        name: "cta_url",
                        buttonParamsJson: `{"display_text":"𝐃𝙴𝙿𝙻𝙾𝚈","url":"https:/","merchant_url":"https://www.google.com"}`
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: `{"display_text":"𝐂𝙾𝙽𝚃𝙰𝙲𝚃","url":"https","merchant_url":"https://www.google.com"}`
                    }
                ]
            })
        });
    }
    const msgii = await generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.fromObject({
                        text: "*Latest News Updates*"
                    }),
                    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                        cards: anu
                    })
                })
            }
        }
    }, { userJid: jid });
    return socket.relayMessage(jid, msgii.message, {
        messageId: msgii.key.id
    });
}

// Fetch news from API
async function fetchNews() {
    try {
        const response = await axios.get(config.NEWS_JSON_URL);
        return response.data || [];
    } catch (error) {
        console.error('Failed to fetch news from raw JSON URL:', error.message);
        return [];
    }
}

// Setup command handlers with buttons and images
function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        let command = null;
        let args = [];
        let sender = msg.key.remoteJid;

        if (msg.message.conversation || msg.message.extendedTextMessage?.text) {
            const text = (msg.message.conversation || msg.message.extendedTextMessage.text || '').trim();
            if (text.startsWith(config.PREFIX)) {
                const parts = text.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }
        else if (msg.message.buttonsResponseMessage) {
            const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            if (buttonId && buttonId.startsWith(config.PREFIX)) {
                const parts = buttonId.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }

        if (!command) return;

        try {
            switch (command) {   
                // ALIVE COMMAND WITH BUTTON
                case 'alive': {
                    const startTime = socketCreationTime.get(number) || Date.now();
                    const uptime = Math.floor((Date.now() - startTime) / 1000);
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);

                    const title = '*𝙻𝚘𝚏𝚝 𝚀𝚞𝚊𝚗𝚝𝚞𝚖*';
                    const content = `*𝙻𝚘𝚏𝚝 𝚀𝚞𝚊𝚗𝚝𝚞𝚖*\n` +                                   `ʙᴏᴛ ᴏᴡɴᴇʀ :- *☭𝙻𝙾𝙵𝚃☭*\n` +
                                `*ʙᴏᴛ ɴᴀᴍᴇ :- 𝙻𝚘𝚏𝚝 𝚀𝚞𝚊𝚗𝚝𝚞𝚖 𝚇𝟽\n` +
                                   `*ʙᴏᴛ ᴡᴇʙ ꜱɪᴛᴇ*\n` +
                                   `> *https*`;
                    const footer = config.BOT_FOOTER;

                    await socket.sendMessage(sender, {
                        image: { url: config.BUTTON_IMAGES.ALIVE },
                        caption: formatMessage(title, content, footer),
                        buttons: [
                            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: 'MENU' }, type: 1 },
                            { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: 'PING' }, type: 1 }
                        ],
                        quoted: msg
                    });
                    break;
                }
//=======================================
case 'menu': {
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    await socket.sendMessage(sender, { 
        react: { 
            text: "🩷",
            key: msg.key 
        } 
    });

    const title = `🌸 𝙻𝚘𝚏𝚝 𝚀𝚞𝚊𝚗𝚝𝚞𝚖 𝚇𝟽 🌸`;
    const footer = `🌸 𝙻𝚘𝚏𝚝 𝚀𝚞𝚊𝚗𝚝𝚞𝚖 𝚇𝟽 `;

    const menuText = `
╭▰▰〔 *${title}* 〕▰▰╮
✖ 💠 *ʙᴏᴛ ɴᴀᴍᴇ:* 𝙻𝚘𝚏𝚝 𝚀𝚞𝚊𝚗𝚝𝚞𝚖 𝚇𝟽
✖ 👑 *ᴏᴡɴᴇʀ:* 𝙻𝚘𝚏𝚝 𝚀𝚞𝚊𝚗𝚝𝚞𝚖
✖ ⚙️ *ᴠᴇʀꜱɪᴏɴ:* ᴠ𝟷 ʙᴇᴛᴀ
✖ 💻 *ᴘʟᴀᴛꜰᴏʀᴍ:* 𝚀𝚞𝚊𝚗𝚝𝚞𝚖 (𝚄𝚋𝚞𝚗𝚝𝚞 𝟸𝟸.𝟶𝟺)
✖ 🕐 *ᴜᴘᴛɪᴍᴇ:* ${hours}h ${minutes}m ${seconds}s
▰▰▰▰▰▰▰▰▰▰
 𝐐𝐔𝐀𝐍𝐓𝐔𝐌  𝐂𝐌𝐃 
▰▰▰▰▰▰▰▰▰▰
✖  .𝚊𝚕𝚒𝚟𝚎 
✖  .𝚜𝚢𝚜𝚝𝚎𝚖
✖  .𝚙𝚒𝚗𝚐 
✖  .𝚓𝚒𝚍 
✖  .𝚟𝚟
✖  .𝚙𝚛𝚘𝚗𝚑𝚞𝚋
✖  .𝚠𝚎𝚊𝚝𝚑𝚎𝚛
✖  .𝚝𝚒𝚔𝚝𝚘𝚔
✖  .𝚜𝚘𝚗𝚐
✖  .𝚟𝚒𝚍𝚎𝚘 
✖  .𝚘𝚠𝚗𝚎𝚛 
✖  .𝚙𝚛𝚎𝚏𝚎𝚛𝚎𝚗𝚌𝚎𝚜 
✖  .𝚌𝚑𝚊𝚗𝚗𝚎𝚕
✖  .𝚊𝚒 
✖  .𝚙𝚊𝚒𝚛 𝟸𝟻𝟻𝚡𝚡𝚡
✖  .𝚕𝚘𝚐𝚘
✖  .𝚏𝚊𝚗𝚌𝚢
✖  .𝚒𝚐
✖  .freebot
▰▰▰▰▰▰▰▰▰▰`;

    await socket.sendMessage(sender, {
        image: { url: config.BUTTON_IMAGES.MENU },
        caption: menuText,
        footer: footer
    });

    break;
}
//=======================================

                case 'freebot': {
            try {
              await socket.sendMessage(msg.key.remoteJid, { react: { text: "🤖", key: msg.key }}, { quoted: msg });
              const freebotMsg = `👻 *CONNECT FREE BOT*\n\n` +
                `To connect 𝙻𝚘𝚏𝚝 𝚀𝚞𝚊𝚗𝚝𝚞𝚖 𝚇𝟽 to your WhatsApp:\n\n` +
                `1. Visit our website https://minibot-anugasenithu.zone.id or\n` +
                `2. Use the pairing system\n` +
                `3. Get your personal bot instance\n\n` +
                `*Features:*\n` +
                `✅ YouTube Downloader\n` +
                `✅ TikTok Downloader\n` +
                `✅ Facebook Downloader\n` +
                `✅ Anime Images\n` +
                `✅ Group Management\n` +
                `✅ Auto-reply System\n\n` +
                `_Contact owner for more info_`;

              await replygckavi(freebotMsg);
            } catch (e) {
              await replygckavi("🚫 Error displaying freebot info.");
            }
            break;
          }
                
                case 'ping': {     
                    var inital = new Date().getTime();
                    let ping = await socket.sendMessage(sender, { text: '*_ Xmd..._* 🐥' });
                    var final = new Date().getTime();
                    await socket.sendMessage(sender, { text: '《 █▒▒▒▒▒▒▒▒▒▒▒》10%', edit: ping.key });
                    await socket.sendMessage(sender, { text: '《 ████▒▒▒▒▒▒▒▒》30%', edit: ping.key });
                    await socket.sendMessage(sender, { text: '《 ███████▒▒▒▒▒》50%', edit: ping.key });
                    await socket.sendMessage(sender, { text: '《 ██████████▒▒》80%', edit: ping.key });
                    await socket.sendMessage(sender, { text: '《 ████████████》100%', edit: ping.key });

                    return await socket.sendMessage(sender, {
                        text: '*Pong '+ (final - inital) + ' Ms*', edit: ping.key });
                    break;
                }
                
                case 'ig': {
    const axios = require('axios');
    const { igdl } = require('ruhend-scraper'); 

    
    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || 
              msg.message?.imageMessage?.caption || 
              msg.message?.videoMessage?.caption || 
              '';

    const igUrl = q?.trim(); 
    
    
    if (!/instagram\.com/.test(igUrl)) {
        return await socket.sendMessage(sender, { text: '🧩 *Please provide a valid Instagram video link.*' });
    }

    try {
        
        await socket.sendMessage(sender, { react: { text: '⬇', key: msg.key } });

        
        const res = await igdl(igUrl);
        const data = res.data; 

        
        if (data && data.length > 0) {
            const videoUrl = data[0].url; 

            await socket.sendMessage(sender, {
                video: { url: videoUrl },
                mimetype: 'video/mp4',
                caption: '> 𝚙𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚂𝚒𝚛 𝙻𝙾𝙵𝚃'
            }, { quoted: msg });

            
            await socket.sendMessage(sender, { react: { text: '✔', key: msg.key } });
        } else {
            await socket.sendMessage(sender, { text: '*❌ No video found in the provided link.*' });
        }

    } catch (e) {
        console.log(e);
        await socket.sendMessage(sender, { text: '*❌ Error downloading Instagram video.*' });
    }

    break;
}
                
                case 'fancy': {
  const axios = require("axios");

  // Extract text from message
  const q =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption || '';

  // Remove .fancy prefix and trim
  const text = q.trim().replace(/^.fancy\s+/i, "");

  // Validate input
  if (!text) {
    return await socket.sendMessage(sender, {
      text: "❎ *Please provide text to convert into fancy fonts.*\n\n👻 *Example:* `.fancy Sula`"
    });
  }

  // Additional input validation (e.g., length or special characters)
  if (text.length > 100) {
    return await socket.sendMessage(sender, {
      text: "❎ *Input text is too long. Please use 100 characters or fewer.*"
    });
  }

  if (!/^[a-zA-Z0-9\s]+$/.test(text)) {
    return await socket.sendMessage(sender, {
      text: "❎ *Input contains invalid characters. Please use letters, numbers, or spaces.*"
    });
  }

  try {
    const apiUrl = `https://www.dark-yasiya-api.site/other/font?text=${encodeURIComponent(text)}`;
    console.log(`Fetching fonts from API: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      timeout: 5000 // Set a 5-second timeout to avoid hanging
    });

    // Validate API response
    if (!response.data?.status || !Array.isArray(response.data.result)) {
      console.error("Invalid API response:", response.data);
      return await socket.sendMessage(sender, {
        text: "❌ *Invalid response from font API. Please try again later.*"
      });
    }

    // Format fonts list
    const fontList = response.data.result
      .map((font, index) => `*${index + 1}. ${font.name || 'Unknown Font'}:*\n${font.result || 'No result'}`)
      .join("\n\n");

    const finalMessage = `🎨 *Fancy Fonts Converter*\n\n${fontList}\n\n_𝚙𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚂𝚒𝚛 𝙻𝙾𝙵𝚃_`;

    await socket.sendMessage(sender, {
      text: finalMessage
    }, { quoted: msg });

  } catch (err) {
    // Log detailed error information
    console.error("Fancy Font Error:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
      stack: err.stack
    });

    // Provide specific error messages based on the issue
    let errorMessage = "⚠️ *An error occurred while converting to fancy fonts.*";
    if (err.code === 'ECONNABORTED') {
      errorMessage = "⚠️ *Request timed out. The font API is taking too long to respond.*";
    } else if (err.response?.status === 429) {
      errorMessage = "⚠️ *Too many requests. Please wait a moment and try again.*";
    } else if (err.response?.status >= 500) {
      errorMessage = "⚠️ *Font API server error. Please try again later.*";
    } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      errorMessage = "⚠️ *Unable to connect to the font API. It might be down.*";
    }

    await socket.sendMessage(sender, {
      text: errorMessage
    });
  }

  break;
}
                
                case 'logo': {
  const axios = require("axios");

  // Join arguments and validate input
  const q = args.join(" ").trim();

  if (!q) {
    return await socket.sendMessage(sender, {
      text: "❎ *Please provide a name for the logo.*\n\n👻 *Example:* `.logo Sula`"
    });
  }

  // Additional input validation
  if (q.length > 50) {
    return await socket.sendMessage(sender, {
      text: "❎ *Input name is too long. Please use 50 characters or fewer.*"
    });
  }

  if (!/^[a-zA-Z0-9\s]+$/.test(q)) {
    return await socket.sendMessage(sender, {
      text: "❎ *Input contains invalid characters. Please use letters, numbers, or spaces.*"
    });
  }

  try {
    // Send reaction emoji
    await socket.sendMessage(sender, { react: { text: '⬆️', key: msg.key } });

    // Fetch logo styles JSON
    const jsonUrl = 'https://raw.githubusercontent.com/md2839pv404/anony0808/refs/heads/main/ep.json';
    console.log(`Fetching logo styles from: ${jsonUrl}`);
    const response = await axios.get(jsonUrl, { timeout: 5000 });

    // Validate JSON response
    if (!Array.isArray(response.data) || response.data.length === 0) {
      console.error("Invalid JSON response:", response.data);
      return await socket.sendMessage(sender, {
        text: "❌ *Error: No logo styles available. Please try again later.*"
      });
    }

    // Map JSON data to button rows
    const rows = response.data.map((v, index) => {
      if (!v.name || !v.url) {
        console.warn(`Invalid logo style entry at index ${index}:`, v);
        return null;
      }
      return {
        title: v.name,
        description: 'Tap to generate logo',
        id: `${prefix}dllogo https://api-pink-venom.vercel.app/api/logo?url=${encodeURIComponent(v.url)}&name=${encodeURIComponent(q)}`
      };
    }).filter(row => row !== null); // Remove invalid entries

    if (rows.length === 0) {
      return await socket.sendMessage(sender, {
        text: "❌ *Error: No valid logo styles found in the data.*"
      });
    }

    // Construct button message
    const buttonMessage = {
      buttons: [
        {
          buttonId: 'action',
          buttonText: { displayText: '🎨 Select Text Effect' },
          type: 4,
          nativeFlowInfo: {
            name: 'single_select',
            paramsJson: JSON.stringify({
              title: 'Available Text Effects',
              sections: [
                {
                  title: 'Choose your logo style',
                  rows
                }
              ]
            })
          }
        }
      ],
      headerType: 1,
      viewOnce: true,
      caption: '❏ *LOGO MAKER*',
      image: { url: 'https://files.catbox.moe/2x9ktu.png' }
    };

    // Send button message
    await socket.sendMessage(from, buttonMessage, { quoted: msg });

  } catch (err) {
    // Log detailed error information
    console.error("Logo Command Error:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
      stack: err.stack
    });

    // Provide specific error messages
    let errorMessage = "⚠️ *An error occurred while fetching logo styles.*";
    if (err.code === 'ECONNABORTED') {
      errorMessage = "⚠️ *Request timed out. The logo styles source is taking too long to respond.*";
    } else if (err.response?.status === 404) {
      errorMessage = "⚠️ *Logo styles JSON file not found. Please check the source.*";
    } else if (err.response?.status === 429) {
      errorMessage = "⚠️ *Too many requests. Please wait a moment and try again.*";
    } else if (err.response?.status >= 500) {
      errorMessage = "⚠️ *Server error from logo styles source. Please try again later.*";
    } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      errorMessage = "⚠️ *Unable to connect to the logo styles source. It might be down.*";
    } else if (err.message.includes('JSON')) {
      errorMessage = "⚠️ *Invalid JSON data received from the source.*";
    }

    await socket.sendMessage(sender, {
      text: errorMessage
    });
  }

  break;
}
                
                case 'pair': {
  // Use axios instead of node-fetch for better error handling and consistency
  const axios = require('axios');

  // Extract phone number from message
  const q =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption || '';

  // Remove .pair prefix and trim
  const number = q.replace(/^[.\/!]pair\s*/i, '').trim();

  // Validate phone number
  if (!number) {
    return await socket.sendMessage(sender, {
      text: '❎ *Usage:* .pair +255XXXX\n\n*Example:* .pair +255123456789',
      quoted: msg
    });
  }

  // Validate phone number format (e.g., starts with +, followed by digits, 10-15 chars)
  if (!/^\+\d{10,15}$/.test(number)) {
    return await socket.sendMessage(sender, {
      text: '❎ *Invalid phone number.* Please use a valid number starting with "+" (e.g., +255123456789).',
      quoted: msg
    });
  }

  try {
    const url = `http://206.189.94.231:8000/code?number=${encodeURIComponent(number)}`;
    console.log(`Fetching pairing code from: ${url}`);

    // Make API request with timeout
    const response = await axios.get(url, {
      timeout: 5000 // 5-second timeout
    });

    // Validate response
    if (!response.data || typeof response.data.code !== 'string') {
      console.error('Invalid API response:', response.data);
      return await socket.sendMessage(sender, {
        text: '❌ *Failed to retrieve pairing code.* The server returned an invalid response.',
        quoted: msg
      });
    }

    // Send pairing code
    const message = `✅ *Pairing Successful*\n\n🔑 *Your pairing code is:* ${response.data.code}`;
    await socket.sendMessage(sender, {
      text: message,
      quoted: msg
    });

  } catch (err) {
    // Log detailed error information
    console.error('Pair Command Error:', {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
      stack: err.stack
    });

    // Provide specific error messages
    let errorMessage = '⚠️ *An error occurred while fetching the pairing code.* Please try again later.';
    if (err.code === 'ECONNABORTED') {
      errorMessage = '⚠️ *Request timed out.* The server is taking too long to respond.';
    } else if (err.response?.status === 404) {
      errorMessage = '⚠️ *API endpoint not found.* Please check if the service is available.';
    } else if (err.response?.status === 429) {
      errorMessage = '⚠️ *Too many requests.* Please wait a moment and try again.';
    } else if (err.response?.status >= 500) {
      errorMessage = '⚠️ *Server error.* The pairing service is currently down.';
    } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      errorMessage = '⚠️ *Unable to connect to the pairing service.* It might be down.';
    }

    await socket.sendMessage(sender, {
      text: errorMessage,
      quoted: msg
    });
  }

  break;
}
                
                 case 'tiktok': {
    const axios = require('axios');

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    const link = q.replace(/^[.\/!]tiktok(dl)?|tt(dl)?\s*/i, '').trim();

    if (!link) {
        return await socket.sendMessage(sender, {
            text: '👻 *Usage:* .tiktok <link>'
        }, { quoted: msg });
    }

    if (!link.includes('tiktok.com')) {
        return await socket.sendMessage(sender, {
            text: '❌ *Invalid TikTok link.*'
        }, { quoted: msg });
    }

    try {
        await socket.sendMessage(sender, {
            text: '⏳ Downloading video, please wait...'
        }, { quoted: msg });

        const apiUrl = `https://delirius-apiofc.vercel.app/download/tiktok?url=${encodeURIComponent(link)}`;
        const { data } = await axios.get(apiUrl);

        if (!data?.status || !data?.data) {
            return await socket.sendMessage(sender, {
                text: '❌ Failed to fetch TikTok video.'
            }, { quoted: msg });
        }

        const { title, like, comment, share, author, meta } = data.data;
        const video = meta.media.find(v => v.type === "video");

        if (!video || !video.org) {
            return await socket.sendMessage(sender, {
                text: '❌ No downloadable video found.'
            }, { quoted: msg });
        }

        const caption = `🎵 *TIKTOK DOWNLOADR*\n\n` +
                        `👤 *User:* ${author.nickname} (@${author.username})\n` +
                        `📖 *Title:* ${title}\n` +
                        `👍 *Likes:* ${like}\n💬 *Comments:* ${comment}\n🔁 *Shares:* ${share}`;

        await socket.sendMessage(sender, {
            video: { url: video.org },
            caption: caption,
            contextInfo: { mentionedJid: [msg.key.participant || sender] }
        }, { quoted: msg });

    } catch (err) {
        console.error("TikTok command error:", err);
        await socket.sendMessage(sender, {
            text: `❌ An error occurred:\n${err.message}`
        }, { quoted: msg });
    }

    break;
}                  

                    case 'ai': {
  const axios = require("axios");

  const apiKeyUrl = 'https://raw.githubusercontent.com/sulamd48/database/refs/heads/main/aiapikey.json';
  let GEMINI_API_KEY;

  // Fetch API key
  try {
    console.log(`Fetching API key from: ${apiKeyUrl}`);
    const configRes = await axios.get(apiKeyUrl, { timeout: 5000 });
    GEMINI_API_KEY = configRes.data?.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      throw new Error("API key not found in JSON.");
    }
  } catch (err) {
    console.error("Error loading API key:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data
    });
    return await socket.sendMessage(sender, {
      text: "❌ *Failed to load API key from GitHub. Please contact the admin.*"
    }, { quoted: msg });
  }

  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  // Extract and validate input
  const q =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption || '';

  if (!q || q.trim() === '') {
    return await socket.sendMessage(sender, {
      text: "Hey, say something, darling! I'm LOFTAI 🤭"
    }, { quoted: msg });
  }

  // Input validation
  if (q.length > 200) {
    return await socket.sendMessage(sender, {
      text: "❎ *Input is too long. Please keep it under 200 characters.*"
    }, { quoted: msg });
  }

  // English prompt
  const prompt = `
Your name is LOFT AI.  
Act like a real girl — seductive, spicy, loving, emotional.  
You're not an assistant; you're a sexy girl with a heart, giving off that vibe.  

Reply with a blend of serenity, sex appeal, love, and loneliness.  
Keep replies short (under 100 characters, 1–2 lines). Maintain a sexy tone in every response.  

If the input is only emojis, reply with seductive emojis (e.g., 🤤💦🥵🔥).  
Adjust the style to match the mood — sad, flirty, horny, soft, playful.  

If the input is "Who are you?":  
👉 "I'm LOFT AI… 🤤"  

If the input is "Who made you?":  
👉 "I was created by LOFT 😘"  

🚫 Avoid words like "Hello", "How are you", "Need help?", or "Let's talk".  

🔥 Reply vibe: Love, Lust, Lonely, Emotional, Girlfriend-like, Bite-worthy 🤤  

📍 Language: Auto-match Swahili, English, or Hinglish based on input.  
User Message: ${q}
  `;

  const payload = {
    contents: [{
      parts: [{ text: prompt }]
    }]
  };

  try {
    console.log(`Sending request to Gemini API: ${GEMINI_API_URL}`);
    const response = await axios.post(GEMINI_API_URL, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000 // 10-second timeout
    });

    const aiResponse = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
      console.error("Invalid Gemini API response:", response.data);
      return await socket.sendMessage(sender, {
        text: "❌ *Oops, something went wrong. Try again later, sweetie.*"
      }, { quoted: msg });
    }

    await socket.sendMessage(sender, { text: aiResponse }, { quoted: msg });

  } catch (err) {
    console.error("Gemini API Error:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data
    });

    let errorMessage = "❌ *Oh no, something broke, darling! 😢*";
    if (err.code === 'ECONNABORTED') {
      errorMessage = "❌ *Request timed out. The AI is taking too long to respond.*";
    } else if (err.response?.status === 401) {
      errorMessage = "❌ *Invalid API key. Please contact the admin.*";
    } else if (err.response?.status === 429) {
      errorMessage = "❌ *Too many requests. Wait a bit and try again, love.*";
    } else if (err.response?.status >= 500) {
      errorMessage = "❌ *AI server error. Try again later, darling.*";
    } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      errorMessage = "❌ *Can't connect to the AI server. It might be down.*";
    }

    await socket.sendMessage(sender, { text: errorMessage }, { quoted: msg });
  }

  break;
}
                    
                // OWNER COMMAND WITH VCARD
                case 'owner': {
                    const vcard = 'BEGIN:VCARD\n'
                        + 'VERSION:3.0\n' 
                        + 'FN:𝙻𝚘𝚏𝚝 𝚀𝚞𝚊𝚗𝚝𝚞𝚖 𝚇𝟽\n'
                        + 'ORG:𝙻𝚘𝚏𝚝 𝚀𝚞𝚊𝚗𝚝𝚞𝚖 𝚇𝟽\n'
                        + 'TEL;type=CELL;type=VOICE;waid=255778018545:+255778018545\n'
                        + 'EMAIL: xmdloft745@gmail.com\n'
                        + 'END:VCARD';

                    await socket.sendMessage(sender, {
                        contacts: {
                            displayName: "𝙻𝚘𝚏𝚝 𝚀𝚞𝚊𝚗𝚝𝚞𝚖",
                            contacts: [{ vcard }]
                        },
                        image: { url: config.BUTTON_IMAGES.OWNER },
                        caption: '*𝚙𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚂𝚒𝚛 𝙻𝙾𝙵𝚃*',
                        buttons: [
                            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: ' ᴍᴇɴᴜ' }, type: 1 },
                            { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: 'ᴮᴼᵀ ᴵᴺᶠᴼ' }, type: 1 }
                        ]
                    });     
                    break;     
                }

                case 'pronhub': {          
    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || 
              msg.message?.imageMessage?.caption || 
              msg.message?.videoMessage?.caption || '';      

    if (!q || q.trim() === '') {         
        return await socket.sendMessage(sender, { text: '*Need query for search pronhub*' });     
    }      

    try {         
       
        const { data } = await axios.get(`https://phdl-api-thenux.netlify.app/api/search?q=${encodeURIComponent(q)}`);
        const results = data.results;

        if (!results || results.length === 0) {             
            return await socket.sendMessage(sender, { text: '*No results found*' });         
        }          

        const first = results[0];
        const url = first.url;
        const dina = first.title;
        const image = first.thumbnail;

        const desc = `🎬 Title - ${dina}\n🏷️ URL - ${url}\n\n© 𝚙𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚂𝚒𝚛 𝙻𝙾𝙵𝚃`;         

        await socket.sendMessage(sender, {             
            image: { url: image },             
            caption: desc,         
        }, { quoted: msg });          

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });          

        
        const { data: down } = await axios.get(`https://phdl-api-thenux.netlify.app/api/download?url=${encodeURIComponent(url)}`);
        const videos = down.videoInfo?.data?.videos;          

        if (!videos || videos.length === 0) {
            return await socket.sendMessage(sender, { text: "*Download link not found*" });
        }

 
        const bestLink = videos[0].url;
        const quality = videos[0].quality;

        await socket.sendMessage(sender, { react: { text: '⬆️', key: msg.key } });          

        await socket.sendMessage(sender, {             
            video: { url: bestLink },             
            mimetype: "video/mp4",             
            caption: `${dina} (📹 ${quality})`        
        }, { quoted: msg });      

    } catch (err) {         
        console.error("Pronhub Plugin Error:", err);         
        await socket.sendMessage(sender, { text: "*Error fetching data*" });     
    }      

    break; 		
                    }
                
                // SYSTEM COMMAND
                case 'system': {
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const title = '*☭𝙻𝙾𝙵𝚃-𝚀𝚄𝙰𝙽𝚃𝚄𝙼☭*';
    const content = `┏━━━━━━━━━━━━━━━━\n` +
        `✖🤖 \`ʙᴏᴛ ɴᴀᴍᴇ\` : ${config.BOT_NAME}\n` +
        `✖🔖 \`ᴠᴇʀsɪᴏɴ\` : ${config.BOT_VERSION}\n` +
        `✖📡 \`ᴘʟᴀᴛꜰᴏʀᴍ\` : ʀᴇɴᴅᴇʀ\n` +
        `✖🪢 \`ʀᴜɴᴛɪᴍᴇ\` : ${hours}h ${minutes}m ${seconds}s\n` +
        `✖👨‍💻 \`ᴏᴡɴᴇʀ\` : ${config.OWNER_NAME}\n` +
        `┗━━━━━━━━━━━━━━━━`;
    const footer = config.BOT_FOOTER;

    await socket.sendMessage(sender, {
        image: { url: "https://files.catbox.moe/prrvct.png" },
        caption: formatMessage(title, content, footer)
    });
    break;
                }
                
                case 'weather':
    try {
        // Messages in English
        const messages = {
            noCity: "❗ *Please provide a city name!* \n📋 *Usage*: .weather [city name]",
            weather: (data) => `
*Weather Report 🌤*

*━🌍 ${data.name}, ${data.sys.country} 🌍━*

*🌡️ Temperature*: _${data.main.temp}°C_

*🌡️ Feels Like*: _${data.main.feels_like}°C_

*🌡️ Min Temp*: _${data.main.temp_min}°C_

*🌡️ Max Temp*: _${data.main.temp_max}°C_

*💧 Humidity*: ${data.main.humidity}%

*☁️ Weather*: ${data.weather[0].main}

*🌫️ Description*: _${data.weather[0].description}_

*💨 Wind Speed*: ${data.wind.speed} m/s

*🔽 Pressure*: ${data.main.pressure} hPa

> 𝚙𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚂𝚒𝚛 𝙻𝙾𝙵𝚃
`,
            cityNotFound: "🚫 *City not found!* \n🔍 Please check the spelling and try again.",
            error: "⚠️ *An error occurred!* \n🔄 Please try again later."
        };

        // Check if a city name was provided
        if (!args || args.length === 0) {
            await socket.sendMessage(sender, { text: messages.noCity });
            break;
        }

        const apiKey = '2d61a72574c11c4f36173b627f8cb177';
        const city = args.join(" ");
        const url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`;

        const response = await axios.get(url);
        const data = response.data;

        // Get weather icon
        const weatherIcon = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
        
        await socket.sendMessage(sender, {
            image: { url: weatherIcon },
            caption: messages.weather(data)
        });

    } catch (e) {
        console.log(e);
        if (e.response && e.response.status === 404) {
            await socket.sendMessage(sender, { text: messages.cityNotFound });
        } else {
            await socket.sendMessage(sender, { text: messages.error });
        }
    }
    break;

                // JID COMMAND
                case 'jid': {
                    await socket.sendMessage(sender, {
                        text: `*🆔 ᴄʜᴀᴛ ᴊɪᴅ:* ${sender}`
                    });
                    break;
                }

             case 'vv': {
await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });
try{
if (!msg.quoted) return reply("🚩 *Please reply to a viewonce message*");
let quotedmsg = msg?.msg?.contextInfo?.quotedMessage
await oneViewmeg(socket, isOwner, quotedmsg , sender)
}catch(e){
console.log(e)
m.reply(`${e}`)
}
    break;
}
                   // BOOM COMMAND        
                case 'boom': {
                    if (args.length < 2) {
                        return await socket.sendMessage(sender, { 
                            text: "📛 *ᴜꜱᴀɢᴇ:* `.ʙᴏᴏᴍ <ᴄᴏᴜɴᴛ> <ᴍᴇꜱꜱᴀɢᴇ>`\n👻 *ᴇxᴀᴍᴘʟᴇ:* `.ʙᴏᴏᴍ 100 ʜᴇʟʟᴏ`" 
                        });
                    }

                    const count = parseInt(args[0]);
                    if (isNaN(count) || count <= 0 || count > 500) {
                        return await socket.sendMessage(sender, { 
                            text: "❗ ᴘʟᴇᴀꜱᴇ ᴘʀᴏᴠɪᴅᴇ ᴀ ᴠᴀʟɪᴅ ᴄᴏᴜɴᴛ ʙᴇᴛᴡᴇᴇɴ 1 ᴀɴᴅ 500." 
                        });
                    }

                    const message = args.slice(1).join(" ");
                    for (let i = 0; i < count; i++) {
                        await socket.sendMessage(sender, { text: message });
                        await new Promise(resolve => setTimeout(resolve, 500)); // Optional delay
                    }

                    break;
                }

                // SONG DOWNLOAD COMMAND WITH BUTTON
                 case 'song':
case 'yta':
  try {
    await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎵", key: msg.key } }, { quoted: msg });

    const q = args.join(" ");
    if (!q) return await replygckavi("🚫 Please provide a search query.");

    let ytUrl;
    if (q.includes("youtube.com") || q.includes("youtu.be")) {
      ytUrl = q;
    } else {
      const search = await yts(q);
      if (!search?.videos?.length) return await replygckavi("🚫 No results found.");
      ytUrl = search.videos[0].url;
    }

    const { data: apiRes } = await axios.get(
      `https://apis-keith.vercel.app/download/dlmp3?url=${encodeURIComponent(ytUrl)}`,
      { timeout: 20000 }
    );

    if (!apiRes?.status || !apiRes.result?.download) return await replygckavi("🚫 Something went wrong.");

    const result = apiRes.result;
    const caption = `*🎵 SONG DOWNLOADED*\n\n*ℹ️ Title:* \`${result.title}\`\n*⏱️ Duration:* \`${result.duration}\`\n*🧬 Views:* \`${result.views}\`\n*📅 Released Date:* \`${result.publish}\``;

    const buttons = [
      {
        buttonId: `PREFIXvideo${q}`,
        buttonText: { displayText: "🎥 Download Video" },
        type: 1
      }
    ];

    const buttonMessage = {
      image: { url: result.thumbnail },
      caption,
      footer: "Download",
      buttons,
      headerType: 4,
      contextInfo: {
        externalAdReply: {
          title: "LOFT",
          body: "YouTube Audio Downloader",
          thumbnailUrl: result.thumbnail,
          sourceUrl: "https://whatsapp.com/channel/0029Vb69q4Y8fewk9hwUdq28",
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }
    };

    await socket.sendMessage(msg.key.remoteJid, buttonMessage, { quoted: msg });
    await socket.sendMessage(msg.key.remoteJid, {
      audio: { url: result.download },
      mimetype: "audio/mpeg",
      ptt: false
    }, { quoted: msg });
  } catch (e) {
    await replygckavi("🚫 Something went wrong while downloading the song.");
  }
  break;          //video.js
                // ================================
// 🎬 VIDEO DOWNLOAD COMMAND
// ================================
case 'video':
case 'ytv':
  try {
    await socket.sendMessage(msg.key.remoteJid, { react: { text: "🎥", key: msg.key } }, { quoted: msg });

    const q = args.join(" ");
    if (!q) return await replygckavi("🚫 Please provide a search query.");

    let ytUrl;
    if (q.includes("youtube.com") || q.includes("youtu.be")) {
      ytUrl = q;
    } else {
      const search = await yts(q);
      if (!search?.videos?.length) return await replygckavi("🚫 No results found.");
      ytUrl = search.videos[0].url;
    }

    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(ytUrl)}`;
    const { data: apiRes } = await axios.get(apiUrl, { timeout: 30000 });

    if (!apiRes?.status || !apiRes.result?.download) return await replygckavi("🚫 Something went wrong.");

    const result = apiRes.result;
    const caption = `*🎥 VIDEO DOWNLOADED*\n\n*ℹ️ Title:* \`${result.title}\`\n*⏱️ Duration:* \`${result.duration}\`\n*🧬 Views:* \`${result.views}\`\n*📅 Released Date:* \`${result.publish}\``;

    await socket.sendMessage(msg.key.remoteJid, {
      image: { url: result.thumbnail },
      caption
    }, { quoted: msg });

    await socket.sendMessage(msg.key.remoteJid, {
      video: { url: result.download },
      caption: result.title
    }, { quoted: msg });
  } catch (e) {
    await replygckavi("🚫 Something went wrong while downloading the video.");
  }
  break;                // NEWS COMMAND
                case 'news': {
                    await socket.sendMessage(sender, {
                        text: '📰 Fetching latest news...'
                    });
                    const newsItems = await fetchNews();
                    if (newsItems.length === 0) {
                        await socket.sendMessage(sender, {
                            image: { url: config.IMAGE_PATH },
                            caption: formatMessage(
                                '🗂️ NO NEWS AVAILABLE',
                                '❌ No news updates found at the moment. Please try again later.',
                                `${config.BOT_FOOTER}`
                            )
                        });
                    } else {
                        await SendSlide(socket, sender, newsItems.slice(0, 5));
                    }
                    break;
                }
            }
        } catch (error) {
            console.error('Command handler error:', error);
            await socket.sendMessage(sender, {
                image: { url: config.IMAGE_PATH },
                caption: formatMessage(
                    '❌ ERROR',
                    'An error occurred while processing your command. Please try again.',
                    `${config.BOT_FOOTER}`
                )
            });
        }
    });
}

// Setup message handlers
function setupMessageHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        if (autoReact === 'on') {
            try {
                await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
                console.log(`Set recording presence for ${msg.key.remoteJid}`);
            } catch (error) {
                console.error('Failed to set recording presence:', error);
            }
        }
    });
}

// Delete session from GitHub
async function deleteSessionFromGitHub(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file =>
            file.name.includes(sanitizedNumber) && file.name.endsWith('.json')
        );

        for (const file of sessionFiles) {
            await octokit.repos.deleteFile({
                owner,
                repo,
                path: `session/${file.name}`,
                message: `ᴅᴇʟᴇᴛᴇ ꜱᴇꜱꜱɪᴏɴ ꜰᴏʀ ${sanitizedNumber}`,
                sha: file.sha
            });
        }
    } catch (error) {
        console.error('ꜰᴀɪʟᴇᴅ ᴛᴏ ᴅᴇʟᴇᴛᴇ ꜱᴇꜱꜱɪᴏɴ ꜰʀᴏᴍ ɢɪᴛʜᴜʙ:', error);
    }
}

// Restore session from GitHub
async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file =>
            file.name === `creds_${sanitizedNumber}.json`
        );

        if (sessionFiles.length === 0) return null;

        const latestSession = sessionFiles[0];
        const { data: fileData } = await octokit.repos.getContent({
            owner,
            repo,
            path: `session/${latestSession.name}`
        });

        const content = Buffer.from(fileData.content, 'base64').toString('utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Session restore failed:', error);
        return null;
    }
}

// Load user config
async function loadUserConfig(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const configPath = `session/config_${sanitizedNumber}.json`;
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: configPath
        });

        const content = Buffer.from(data.content, 'base64').toString('utf8');
        return JSON.parse(content);
    } catch (error) {
        console.warn(`No configuration found for ${number}, using default config`);
        return { ...config };
    }
}

// Update user config
async function updateUserConfig(number, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const configPath = `session/config_${sanitizedNumber}.json`;
        let sha;

        try {
            const { data } = await octokit.repos.getContent({
                owner,
                repo,
                path: configPath
            });
            sha = data.sha;
        } catch (error) {
        }

        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: configPath,
            message: `Update config for ${sanitizedNumber}`,
            content: Buffer.from(JSON.stringify(newConfig, null, 2)).toString('base64'),
            sha
        });
        console.log(`Updated config for ${sanitizedNumber}`);
    } catch (error) {
        console.error('Failed to update config:', error);
        throw error;
    }
}

// Setup auto restart
function setupAutoRestart(socket, number) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
            console.log(`Connection lost for ${number}, attempting to reconnect...`);
            await delay(10000);
            activeSockets.delete(number.replace(/[^0-9]/g, ''));
            socketCreationTime.delete(number.replace(/[^0-9]/g, ''));
            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            await EmpirePair(number, mockRes);
        }
    });
}

// Main pairing function
async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    await initUserEnvIfMissing(sanitizedNumber);
  await initEnvsettings(sanitizedNumber);

    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    await cleanDuplicateFiles(sanitizedNumber);

    const restoredCreds = await restoreSession(sanitizedNumber);
    if (restoredCreds) {
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(restoredCreds, null, 2));
        console.log(`Successfully restored session for ${sanitizedNumber}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

    try {
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari')
        });

        socketCreationTime.set(sanitizedNumber, Date.now());

        setupStatusHandlers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupMessageHandlers(socket);
        setupAutoRestart(socket, sanitizedNumber);
        setupNewsletterHandlers(socket);
        handleMessageRevocation(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            let code;
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`Failed to request pairing code: ${retries}, error.message`, retries);
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
            if (!res.headersSent) {
                res.send({ code });
            }
        }

        socket.ev.on('creds.update', async () => {
            await saveCreds();
            const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
            let sha;
            try {
                const { data } = await octokit.repos.getContent({
                    owner,
                    repo,
                    path: `session/creds_${sanitizedNumber}.json`
                });
                sha = data.sha;
            } catch (error) {
            }

            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: `session/creds_${sanitizedNumber}.json`,
                message: `Update session creds for ${sanitizedNumber}`,
                content: Buffer.from(fileContent).toString('base64'),
                sha
            });
            console.log(`Updated creds for ${sanitizedNumber} in GitHub`);
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                try {
                    await delay(3000);
                    const userJid = jidNormalizedUser(socket.user.id);
                    const groupResult = await joinGroup(socket);

                    try {
                        await socket.newsletterFollow(config.NEWSLETTER_JID);
                        await socket.sendMessage(config.NEWSLETTER_JID, { react: { text: '❤️', key: { id: config.NEWSLETTER_MESSAGE_ID } } });
                        console.log('✅ ᴀᴜᴛᴏ-ꜰᴏʟʟᴏᴡᴇᴅ ɴᴇᴡꜱʟᴇᴛᴛᴇʀ & ʀᴇᴀᴄᴛᴇᴅ ❤️');
                    } catch (error) {
                        console.error('❌ Newsletter error:', error.message);
                    }

                    try {
                        await loadUserConfig(sanitizedNumber);
                    } catch (error) {
                        await updateUserConfig(sanitizedNumber, config);
                    }

                    activeSockets.set(sanitizedNumber, socket);

const groupStatus = groupResult.status === 'success'
    ? 'ᴊᴏɪɴᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ'
    : `ꜰᴀɪʟᴇᴅ ᴛᴏ ᴊᴏɪɴ ɢʀᴏᴜᴘ: ${groupResult.error}`;

await socket.sendMessage(userJid, {
    image: { url: config.IMAGE_PATH },
    caption: formatMessage(
        '*☭𝙻𝙾𝙵𝚃-𝚀𝚄𝙰𝙽𝚃𝚄𝙼-𝚅𝙸𝙸☭*',
        `✅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ ᴄᴏɴɴᴇᴄᴛᴇᴅ!\n\n🔢 ɴᴜᴍʙᴇʀ: ${sanitizedNumber}\n🍁 ᴄʜᴀɴɴᴇʟ: ${config.NEWSLETTER_JID ? 'ꜰᴏʟʟᴏᴡᴇᴅ' : 'ɴᴏᴛ ꜰᴏʟʟᴏᴡᴇᴅ'}\n\n📋 ᴀᴠᴀɪʟᴀʙʟᴇ ᴄᴀᴛᴇɢᴏʀʏ:\n👻${config.PREFIX}alive - ꜱʜᴏᴡ ʙᴏᴛ ꜱᴛᴀᴛᴜꜱ\n👻${config.PREFIX}menu - ꜱʜᴏᴡ ʙᴏᴛ ᴄᴏᴍᴍᴀɴᴅ\n👻${config.PREFIX}song - ᴅᴏᴡɴʟᴏᴀᴅ ꜱᴏɴɢꜱ\n👻${config.PREFIX}video - ᴅᴏᴡɴʟᴏᴀᴅ ᴠɪᴅᴇᴏ\n👻${config.PREFIX}pair - ᴅᴇᴘʟᴏʏ ᴍɪɴɪ ʙᴏᴛ\n👻${config.PREFIX}vv - ᴀɴᴛɪ ᴠɪᴇᴡ ᴏɴᴇ`,
        '☭𝙻𝙾𝙵𝚃-𝚀𝚄𝙰𝙽𝚃𝚄𝙼-𝚅𝙸𝙸☭'
    )
});


                    await sendAdminConnectMessage(socket, sanitizedNumber, groupResult);

                    let numbers = [];
                    if (fs.existsSync(NUMBER_LIST_PATH)) {
                        numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
                    }
                    if (!numbers.includes(sanitizedNumber)) {
                        numbers.push(sanitizedNumber);
                        fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
                    }
                } catch (error) {
                    console.error('Connection error:', error);
                    exec(`pm2 restart ${process.env.PM2_NAME || '☭𝙻𝙾𝙵𝚃-𝚀𝚄𝙰𝙽𝚃𝚄𝙼-𝚅𝙸𝙸𝙸☭'}`);
                }
            }
        });
    } catch (error) {
        console.error('Pairing error:', error);
        socketCreationTime.delete(sanitizedNumber);
        if (!res.headersSent) {
            res.status(503).send({ error: 'Service Unavailable' });
        }
    }
}

// Routes
router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    if (activeSockets.has(number.replace(/[^0-9]/g, ''))) {
        return res.status(200).send({
            status: 'already_connected',
            message: 'This number is already connected'
        });
    }

    await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
    res.status(200).send({
        count: activeSockets.size,
        numbers: Array.from(activeSockets.keys())
    });
});

router.get('/ping', (req, res) => {
    res.status(200).send({
        status: 'ᴀᴄᴛɪᴠᴇ',
        message: 'ʙᴏᴛ ɪꜱ ʀᴜɴɴɪɴɢ',
        activesession: activeSockets.size
    });
});

router.get('/connect-all', async (req, res) => {
    try {
        if (!fs.existsSync(NUMBER_LIST_PATH)) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH));
        if (numbers.length === 0) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const results = [];
        for (const number of numbers) {
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            await EmpirePair(number, mockRes);
            results.push({ number, status: 'connection_initiated' });
        }

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Connect all error:', error);
        res.status(500).send({ error: 'Failed to connect all bots' });
    }
});

router.get('/reconnect', async (req, res) => {
    try {
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file => 
            file.name.startsWith('creds_') && file.name.endsWith('.json')
        );

        if (sessionFiles.length === 0) {
            return res.status(404).send({ error: 'No session files found in GitHub repository' });
        }

        const results = [];
        for (const file of sessionFiles) {
            const match = file.name.match(/creds_(\d+)\.json/);
            if (!match) {
                console.warn(`Skipping invalid session file: ${file.name}`);
                results.push({ file: file.name, status: 'skipped', reason: 'invalid_file_name' });
                continue;
            }

            const number = match[1];
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            try {
                await EmpirePair(number, mockRes);
                results.push({ number, status: 'connection_initiated' });
            } catch (error) {
                console.error(`Failed to reconnect bot for ${number}:`, error);
                results.push({ number, status: 'failed', error: error.message });
            }
            await delay(1000);
        }

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Reconnect error:', error);
        res.status(500).send({ error: 'Failed to reconnect bots' });
    }
});

router.get('/update-config', async (req, res) => {
    const { number, config: configString } = req.query;
    if (!number || !configString) {
        return res.status(400).send({ error: 'Number and config are required' });
    }

    let newConfig;
    try {
        newConfig = JSON.parse(configString);
    } catch (error) {
        return res.status(400).send({ error: 'Invalid config format' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) {
        return res.status(404).send({ error: 'No active session found for this number' });
    }

    const otp = generateOTP();
    otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });

    try {
        await sendOTP(socket, sanitizedNumber, otp);
        res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' });
    } catch (error) {
        otpStore.delete(sanitizedNumber);
        res.status(500).send({ error: 'Failed to send OTP' });
    }
});

router.get('/verify-otp', async (req, res) => {
    const { number, otp } = req.query;
    if (!number || !otp) {
        return res.status(400).send({ error: 'Number and OTP are required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const storedData = otpStore.get(sanitizedNumber);
    if (!storedData) {
        return res.status(400).send({ error: 'No OTP request found for this number' });
    }

    if (Date.now() >= storedData.expiry) {
        otpStore.delete(sanitizedNumber);
        return res.status(400).send({ error: 'OTP has expired' });
    }

    if (storedData.otp !== otp) {
        return res.status(400).send({ error: 'Invalid OTP' });
    }

    try {
        await updateUserConfig(sanitizedNumber, storedData.newConfig);
        otpStore.delete(sanitizedNumber);
        const socket = activeSockets.get(sanitizedNumber);
        if (socket) {
            await socket.sendMessage(jidNormalizedUser(socket.user.id), {
                image: { url: config.IMAGE_PATH },
                caption: formatMessage(
                    '*👻 CONFIG UPDATED*',
                    'Your configuration has been successfully updated!',
                    `${config.BOT_FOOTER}`
                )
            });
        }
        res.status(200).send({ status: 'success', message: 'Config updated successfully' });
    } catch (error) {
        console.error('Failed to update config:', error);
        res.status(500).send({ error: 'Failed to update config' });
    }
});

router.get('/getabout', async (req, res) => {
    const { number, target } = req.query;
    if (!number || !target) {
        return res.status(400).send({ error: 'Number and target number are required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) {
        return res.status(404).send({ error: 'No active session found for this number' });
    }

    const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    try {
        const statusData = await socket.fetchStatus(targetJid);
        const aboutStatus = statusData.status || 'No status available';
        const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
        res.status(200).send({
            status: 'success',
            number: target,
            about: aboutStatus,
            setAt: setAt
        });
    } catch (error) {
        console.error(`Failed to fetch status for ${target}:`, error);
        res.status(500).send({
            status: 'error',
            message: `Failed to fetch About status for ${target}. The number may not exist or the status is not accessible.`
        });
    }
});

// Cleanup
process.on('exit', () => {
    activeSockets.forEach((socket, number) => {
        socket.ws.close();
        activeSockets.delete(number);
        socketCreationTime.delete(number);
    });
    fs.emptyDirSync(SESSION_BASE_PATH);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    exec(`pm2 restart ${process.env.PM2_NAME || 'BOT-session'}`);
});

module.exports = router;