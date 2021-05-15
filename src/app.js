const { Client } = require("@notionhq/client");
const TelegramBot = require("node-telegram-bot-api");

module.exports = async () => {
  const ADMIN_ID = JSON.parse(process.env.ADMIN_ID);
  const DATABASE_ID = process.env.DATABASE_ID;
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
    polling: true,
  });

  bot.onText(/\/quick (.+)/, (msg, match) => {
    if (ADMIN_ID.includes(msg.from.id)) {
      notion
        .request({
          path: "pages",
          method: "POST",
          body: {
            parent: { database_id: DATABASE_ID },
            properties: {
              Text: [{ text: { content: match[1] } }],
            },
          },
        })
        .then(() => {
          console.log("Added to DB");
        });
    } else {
      bot.sendMessage(msg.chat.id, "You are not an admin.");
    }
  });
};
