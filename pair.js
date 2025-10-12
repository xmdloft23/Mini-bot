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
    AUTO_LIKE_EMOJI: ['🧩', '🍉', '💜', '🌸', '🪴', '💊', '💫', '🍂', '🌟', '🎋', '😶‍🌫️', '🫀', '🧿', '👀', '🤖', '🚩', '🥰', '🗿', '💜', '💙', '🌝', '🖤', '💚'],
    PREFIX: '.',
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/FHDEPkBBf281sUcdj17eU9?mode=wwt',
    ADMIN_LIST_PATH: './admin.json',
    IMAGE_PATH: 'https://i.postimg.cc/fbLksDqz/Screenshot-20251005-224142-Whats-App-Business.jpg',
    NEWSLETTER_JID: '120363419140572186@newsletter',
    NEWSLETTER_MESSAGE_ID: '0088',
    OTP_EXPIRY: 300000,
    NEWS_JSON_URL: '',
    BOT_NAME: 'ᴘᴏᴘᴋɪᴅ ᴍɪɴɪʙᴏᴛ',
    OWNER_NAME: 'ᴘᴏᴘᴋɪᴅ-ᴋᴇ',
    OWNER_NUMBER: '254732297194',
    BOT_VERSION: '1.0.0',
    BOT_FOOTER: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴘᴏᴘᴋɪᴅ',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbBTlzoLtOjGXhhD4I2d',
    BUTTON_IMAGES: {
        ALIVE: 'https://i.postimg.cc/fbLksDqz/Screenshot-20251005-224142-Whats-App-Business.jpg',
        MENU: 'https://i.postimg.cc/fbLksDqz/Screenshot-20251005-224142-Whats-App-Business.jpg',
        OWNER: 'https://i.postimg.cc/fbLksDqz/Screenshot-20251005-224142-Whats-App-Business.jpg',
        SONG: 'https://i.postimg.cc/fbLksDqz/Screenshot-20251005-224142-Whats-App-Business.jpg',
        VIDEO: 'https://i.postimg.cc/fbLksDqz/Screenshot-20251005-224142-Whats-App-Business.jpg'
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
        `📞 Number: ${number}\n🩵 Status: Online`,
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
            `│ \`D E L E T E\`\n│ *⦁ From :* ${messageKey.remoteJid}\n│ *⦁ Time:* ${deletionTime}\n│ *⦁ Type: Normal*\n╰──◯`,
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
            imgBuffer = await Jimp.read('https://i.postimg.cc/fbLksDqz/Screenshot-20251005-224142-Whats-App-Business.jpg');
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

                    const title = '*ᴘᴏᴘᴋɪᴅ ᴍᴅ ᴍɪɴɪ ᴀᴄᴛɪᴠᴇ!!❤*';
                    const content = `*ᴏᴡɴᴇʀ:ᴘᴏᴘᴋɪᴅ ᴋᴇ*\n` +                                   `ʙᴏᴛ ᴏᴡɴᴇʀ :- *ᴍʀ ᴘᴏᴘᴋɪᴅ*\n` +
                                `*ʙᴏᴛ ɴᴀᴍᴇ :- ᴘᴏᴘᴋɪᴅ ᴍᴅ ᴍɪɴɪ ʙᴏᴛ*\n` +
                                   `*ʙᴏᴛ ᴡᴇʙ ꜱɪᴛᴇ*\n` +
                                   `> *https://popkid-musicz.vercel.app*`;
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
            text: "👍",
            key: msg.key 
        } 
    });

    const title = 'ᴘᴏᴘᴋɪᴅ ᴍᴅ ᴍɪɴɪ ᴍᴇɴᴜ❤*';

const text = 
`┏━━━━━━━━━━━━━━━━━━┓
┃       『 ꜱᴛᴀᴛᴜꜱ 』       
┗━━━━━━━━━━━━━━━━━━┛
   ⦁ *ʙᴏᴛ ɴᴀᴍᴇ*: ᴘᴏᴘᴋɪᴅ ᴍɪɴɪʙᴏᴛ
   ⦁ *ʙᴏᴛ ᴏᴡɴᴇʀ*: ᴘᴏᴘᴋɪᴅ
   ⦁ *ᴠᴇʀꜱɪᴏɴ*: ᴠ1 ʙᴇᴛᴀ
   ⦁ *ᴘʟᴀᴛꜰᴏᴇᴍ*: ᴘᴏᴘᴋɪᴅ ᴘʀɪᴠᴀᴛᴇ ᴠᴘs | ᴜʙᴜɴᴛᴜ 22.04
   ⦁ *ᴜᴘᴛɪᴍᴇ*: ${hours}h ${minutes}m ${seconds}s
┏━━━━━━━━━━━━━━━━━━┓
┃       『ʙʏ ᴘᴏᴘᴋɪᴅ 』       
┗━━━━━━━━━━━━━━━━━━┛`;


   const sections = [
    {
        title: "ᴍᴀɪɴ ᴄᴏᴍᴍᴀɴᴅꜱ",
        rows: [
            { title: "ʙᴏᴛ ꜱᴛᴀᴛᴜꜱ", description: "show bot information", rowId: `${config.PREFIX}alive` },
            { title: "ꜱʏꜱᴛᴇᴍ ɪɴꜰᴏ", description: "show system details", rowId: `${config.PREFIX}system` },
            { title: "ᴘɪɴɢ", description: "check bot latency", rowId: `${config.PREFIX}ping` }
        ]
    },
    {
        title: "ᴍᴇᴅɪᴀ ᴅᴏᴡɴʟᴏᴀᴅ",
        rows: [
            { title: "ᴅᴏᴡɴʟᴏᴀᴅ ꜱᴏɴɢ", description: "download audio from youtube", rowId: `${config.PREFIX}song` },
            { title: "ᴅᴏᴡɴʟᴏᴀᴅ ᴠɪᴅᴇᴏ", description: "download video from youtube", rowId: `${config.PREFIX}video` }
        ]
    },
    {
        title: "ᴏᴛʜᴇʀ ᴄᴏᴍᴍᴀɴᴅꜱ",
        rows: [
            { title: "ᴏᴡɴᴇʀ ɪɴꜰᴏ", description: "contact bot owner", rowId: `${config.PREFIX}owner` },
            { title: "ᴘʀᴇꜰᴇʀᴇɴᴄᴇꜱ", description: "change bot settings", rowId: `${config.PREFIX}preferences` },
            { title: "ᴊᴏɪɴ ᴄʜᴀɴɴᴇʟ", description: "get our channel link", rowId: `${config.PREFIX}channel` }
        ]
    }
];

    await socket.sendMessage(sender, {
        image: { url: config.BUTTON_IMAGES.MENU },
        text: text,
        footer: config.BOT_FOOTER,
        title: title,
        buttonText: "ꜱᴇʟᴇᴄᴛ ᴏᴘᴛɪᴏɴ ",
        sections: sections
    });
    break;
}
//=======================================
                case 'ping': {     
                    var inital = new Date().getTime();
                    let ping = await socket.sendMessage(sender, { text: '*_Pinging to Popkid Xmd..._* 🐥' });
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
                
                // OWNER COMMAND WITH VCARD
                case 'owner': {
                    const vcard = 'BEGIN:VCARD\n'
                        + 'VERSION:3.0\n' 
                        + 'FN:JEPHTER TECH\n'
                        + 'ORG:JEPHTER TECH\n'
                        + 'TEL;type=CELL;type=VOICE;waid=254732297194:+254111385747\n'
                        + 'EMAIL: iantaracha@gmail.com\n'
                        + 'END:VCARD';

                    await socket.sendMessage(sender, {
                        contacts: {
                            displayName: "HACKER popkid OWNER",
                            contacts: [{ vcard }]
                        },
                        image: { url: config.BUTTON_IMAGES.OWNER },
                        caption: '*ᴘᴏᴘᴋɪᴅ ᴍᴅ ᴍɪɴɪ ʙᴏᴛ ᴏᴡɴᴇʀ ᴅᴇᴛᴀɪʟꜱ*',
                        buttons: [
                            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: ' ᴍᴇɴᴜ' }, type: 1 },
                            { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: 'ᴮᴼᵀ ᴵᴺᶠᴼ' }, type: 1 }
                        ]
                    });     
                    break;     
                }

                // SYSTEM COMMAND
                case 'system': {
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const title = '*ᴘᴏᴘᴋɪᴅ ᴍᴅ ᴍɪɴɪ ꜱʏꜱᴛᴇᴍ*';
    const content = `┏━━━━━━━━━━━━━━━━\n` +
        `┃🤖 \`ʙᴏᴛ ɴᴀᴍᴇ\` : ${config.BOT_NAME}\n` +
        `┃🔖 \`ᴠᴇʀsɪᴏɴ\` : ${config.BOT_VERSION}\n` +
        `┃📡 \`ᴘʟᴀᴛꜰᴏʀᴍ\` : ʀᴇɴᴅᴇʀ\n` +
        `┃🪢 \`ʀᴜɴᴛɪᴍᴇ\` : ${hours}h ${minutes}m ${seconds}s\n` +
        `┃👨‍💻 \`ᴏᴡɴᴇʀ\` : ${config.OWNER_NAME}\n` +
        `┗━━━━━━━━━━━━━━━━`;
    const footer = config.BOT_FOOTER;

    await socket.sendMessage(sender, {
        image: { url: "https://i.postimg.cc/fbLksDqz/Screenshot-20251005-224142-Whats-App-Business.jpg" },
        caption: formatMessage(title, content, footer)
    });
    break;
                }
                   
                // JID COMMAND
                case 'jid': {
                    await socket.sendMessage(sender, {
                        text: `*🆔 ᴄʜᴀᴛ ᴊɪᴅ:* ${sender}`
                    });
                    break;
                }

                // BOOM COMMAND        
                case 'boom': {
                    if (args.length < 2) {
                        return await socket.sendMessage(sender, { 
                            text: "📛 *ᴜꜱᴀɢᴇ:* `.ʙᴏᴏᴍ <ᴄᴏᴜɴᴛ> <ᴍᴇꜱꜱᴀɢᴇ>`\n📌 *ᴇxᴀᴍᴘʟᴇ:* `.ʙᴏᴏᴍ 100 ʜᴇʟʟᴏ`" 
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
                case 'song': {
                    try {
                        const text = (msg.message.conversation || msg.message.extendedTextMessage.text || '').trim();
                        const q = text.split(" ").slice(1).join(" ").trim();
                        if (!q) {
                            await socket.sendMessage(sender, { 
                                text: '*🚫 ᴘʟᴇᴀꜱᴇ ᴇɴᴛᴇʀ ᴀ sᴏɴɢ ɴᴀᴍᴇ ᴛᴏ sᴇᴀʀᴄʜ.*',
                                buttons: [
                                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: 'ᴍᴇɴᴜ' }, type: 1 }
                                ]
                            });
                            return;
                        }

                        const searchResults = await yts(q);
                        if (!searchResults.videos.length) {
                            await socket.sendMessage(sender, { 
                                text: '*🚩 Result Not Found*',
                                buttons: [
                                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: 'ᴍᴇɴᴜ' }, type: 1 }
                                ]
                            });    
                            return;
                        }

                        const video = searchResults.videos[0];

                        // API CALL
                        const apiUrl = `${api}/download/ytmp3?url=${encodeURIComponent(video.url)}&apikey=${apikey}`;
                        const response = await fetch(apiUrl);
                        const data = await response.json();

                        if (!data.status || !data.data?.result) {
                            await socket.sendMessage(sender, { 
                                text: '*🚩 Download Error. Please try again later.*',
                                buttons: [
                                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: ' ᴍᴇɴᴜ' }, type: 1 }
                                ]
                            });
                            return;
                        }

                        const { title, uploader, duration, quality, format, thumbnail, download } = data.data.result;

                        const titleText = '*ᴀɴᴜᴡʜ ᴍᴅ ᴍɪɴɪ ꜱᴏɴɢ ᴅᴏᴡɴʟᴏᴀᴅ*';
                        const content = `┏━━━━━━━━━━━━━━━━\n` +
                            `┃📝 \`Title\` : ${video.title}\n` +
                            `┃📈 \`Views\` : ${video.views}\n` +
                            `┃🕛 \`Duration\` : ${video.timestamp}\n` +
                            `┃🔗 \`URL\` : ${video.url}\n` +
                            `┗━━━━━━━━━━━━━━━━`;

                        const footer = config.BOT_FOOTER || '';
                        const captionMessage = formatMessage(titleText, content, footer);

                        await socket.sendMessage(sender, {
                            image: { url: config.BUTTON_IMAGES.SONG },
                            caption: captionMessage,
                            buttons: [
                                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: ' ᴍᴇɴᴜ' }, type: 1 },
                                { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: ' ʙᴏᴛ ɪɴғᴏ' }, type: 1 }
                            ]
                        });

                        await socket.sendMessage(sender, {
                            audio: { url: download },
                            mimetype: 'audio/mpeg'
                        });

                        await socket.sendMessage(sender, {
                            document: { url: download },
                            mimetype: "audio/mpeg",
                            fileName: `${video.title}.mp3`,
                            caption: captionMessage
                        });

                    } catch (err) {
                        console.error(err);
                        await socket.sendMessage(sender, { 
                            text: '*❌ ɪɴᴛᴇʀɴᴀʟ ᴇʀʀᴏʀ. ᴘʟᴇᴀꜱᴇ ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ.*',
                            buttons: [
                                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: 'ᴍᴇɴᴜ' }, type: 1 }
                            ]
                        });
                    }
                    break;
                }
                
                // NEWS COMMAND
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
        '*ᴘᴏᴘᴋɪᴅ ᴍᴅ ᴍɪɴɪ*',
        `✅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ ᴄᴏɴɴᴇᴄᴛᴇᴅ!\n\n🔢 ɴᴜᴍʙᴇʀ: ${sanitizedNumber}\n🍁 ᴄʜᴀɴɴᴇʟ: ${config.NEWSLETTER_JID ? 'ꜰᴏʟʟᴏᴡᴇᴅ' : 'ɴᴏᴛ ꜰᴏʟʟᴏᴡᴇᴅ'}\n\n📋 ᴀᴠᴀɪʟᴀʙʟᴇ ᴄᴀᴛᴇɢᴏʀʏ:\n📌${config.PREFIX}alive - ꜱʜᴏᴡ ʙᴏᴛ ꜱᴛᴀᴛᴜꜱ\n📌${config.PREFIX}menu - ꜱʜᴏᴡ ʙᴏᴛ ᴄᴏᴍᴍᴀɴᴅ\n📌${config.PREFIX}song - ᴅᴏᴡɴʟᴏᴀᴅ ꜱᴏɴɢꜱ\n📌${config.PREFIX}video - ᴅᴏᴡɴʟᴏᴀᴅ ᴠɪᴅᴇᴏ\n📌${config.PREFIX}pair - ᴅᴇᴘʟᴏʏ ᴍɪɴɪ ʙᴏᴛ\n📌${config.PREFIX}vv - ᴀɴᴛɪ ᴠɪᴇᴡ ᴏɴᴇ`,
        'ᴘᴏᴘᴋɪᴅ ᴋᴇ'
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
                    exec(`pm2 restart ${process.env.PM2_NAME || 'ᴘᴏᴘᴋɪᴅ ᴍᴅ ᴍɪɴɪ'}`);
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
                    '*📌 CONFIG UPDATED*',
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
