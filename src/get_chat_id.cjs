const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is missing in .env');
    process.exit(1);
}

console.log('🤖 Bot is listening... Please send any message to the bot in Telegram.');

const bot = new TelegramBot(token, { polling: true });

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    console.log(`\n✅ RECEIVED MESSAGE!`);
    console.log(`💬 Text: "${msg.text}"`);
    console.log(`🆔 YOUR CHAT ID IS: ${chatId}`);
    console.log(`\nI am saving this to the .env file automatically...`);
    
    // Auto-save to .env
    const fs = require('fs');
    const path = require('path');
    const envPath = path.resolve(__dirname, '../.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    if (envContent.includes('TELEGRAM_CHAT_ID=')) {
        envContent = envContent.replace(/TELEGRAM_CHAT_ID=.*/, `TELEGRAM_CHAT_ID=${chatId}`);
    } else {
        envContent += `\nTELEGRAM_CHAT_ID=${chatId}`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Saved to .env! You can close this script now.');
    
    // Reply to user
    bot.sendMessage(chatId, `✅ Connected! Your Chat ID is ${chatId}. Alpha Radar will send alerts here.`)
        .then(() => {
            process.exit(0);
        });
});
