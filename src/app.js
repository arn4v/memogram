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
  const AUX_COMMANDS = ["/todo", "/done", "/inprogress", "/task", "/note"];

  bot.onText(/\/quick (.+)/, async (msg, match) => {
    if (ADMIN_ID.includes(msg.from.id)) {
      if (!msg?.reply_to_message?.message_id) {
        await notion.request({
          path: "pages",
          method: "POST",
          body: {
            parent: { database_id: DATABASE_ID },
            properties: {
              Text: [{ text: { content: match[1] } }],
              message_id: msg.message_id,
              type: { name: "note" },
              status: { name: "n/a" },
            },
          },
        });
      } else {
        bot.sendMessage(
          msg.chat.id,
          "Reply to only works with status commands: /todo, /done, /inprogress and type commands: /note, /task.",
          {
            reply_to_message_id: msg.message_id,
          }
        );
      }
    } else {
      bot.sendMessage(msg.chat.id, "You are not an admin.");
    }
  });

  bot.onText(/\/note/, async (msg, match) => {
    if (ADMIN_ID.includes(msg.from.id)) {
      if (
        msg?.reply_to_message?.message_id &&
        !AUX_COMMANDS.includes(msg?.reply_to_message.text) &&
        msg?.reply_to_message?.text.includes("/quick")
      ) {
        await updateType(msg, "note");
      } else {
        bot.sendMessage(
          msg.chat.id,
          "/note only works when you reply to a note made using /quick command.",
          {
            reply_to_message_id: msg.message_id,
          }
        );
      }
    } else {
      bot.sendMessage(msg.chat.id, "You are not an admin.");
    }
  });

  bot.onText(/\/task/, async (msg, match) => {
    if (ADMIN_ID.includes(msg.from.id)) {
      if (
        msg?.reply_to_message?.message_id &&
        !AUX_COMMANDS.includes(msg?.reply_to_message.text) &&
        msg?.reply_to_message?.text.includes("/quick")
      ) {
        await updateType(msg, "task");
      } else {
        bot.sendMessage(
          msg.chat.id,
          "/task only works when you reply to a note made using /quick command.",
          {
            reply_to_message_id: msg.message_id,
          }
        );
      }
    } else {
      bot.sendMessage(msg.chat.id, "You are not an admin.");
    }
  });

  bot.onText(/\/done/, async (msg, match) => {
    if (ADMIN_ID.includes(msg.from.id)) {
      if (
        msg?.reply_to_message?.message_id &&
        !AUX_COMMANDS.includes(msg?.reply_to_message.text) &&
        msg?.reply_to_message?.text.includes("/quick")
      ) {
        updateStatus(msg, "done");
      } else {
        bot.sendMessage(
          msg.chat.id,
          "/done only works when you reply to a note made using /quick command.",
          {
            reply_to_message_id: msg.message_id,
          }
        );
      }
    } else {
      bot.sendMessage(msg.chat.id, "You are not an admin.");
    }
  });

  bot.onText(/\/todo/, async (msg, match) => {
    if (ADMIN_ID.includes(msg.from.id)) {
      if (
        msg?.reply_to_message?.message_id &&
        !AUX_COMMANDS.includes(msg?.reply_to_message.text) &&
        msg?.reply_to_message?.text.includes("/quick")
      ) {
        updateStatus(msg, "todo");
      } else {
        bot.sendMessage(
          msg.chat.id,
          "/done only works when you reply to a note made using /quick command.",
          {
            reply_to_message_id: msg.message_id,
          }
        );
      }
    } else {
      bot.sendMessage(msg.chat.id, "You are not an admin.");
    }
  });

  bot.onText(/\/inprogress/, async (msg, match) => {
    if (ADMIN_ID.includes(msg.from.id)) {
      if (
        msg?.reply_to_message?.message_id &&
        !AUX_COMMANDS.includes(msg?.reply_to_message.text) &&
        msg?.reply_to_message?.text.includes("/quick")
      ) {
        updateStatus(msg, "inprogress");
      } else {
        bot.sendMessage(
          msg.chat.id,
          "/done only works when you reply to a note made using /quick command.",
          {
            reply_to_message_id: msg.message_id,
          }
        );
      }
    } else {
      bot.sendMessage(msg.chat.id, "You are not an admin.");
    }
  });

  /**
   * @param {TelegramBot.Message} msg
   * @param {("todo" | "done" | "inprogress")} status
   */
  const updateStatus = async (msg, status = "todo") => {
    const notesInDb = await getNotesFromDatabase();
    const note = notesInDb.results.filter((i) => {
      return (
        i.properties.type.select.name === "task" &&
        i.properties.message_id.number === msg?.reply_to_message?.message_id
      );
    })[0];
    if (!note) {
      bot.sendMessage(
        msg.chat.id,
        'The message replied to is not of type "note".',
        {
          reply_to_message_id: msg.message_id,
        }
      );
      return;
    } else {
      await notion.pages.update({
        page_id: note.id,
        properties: {
          status: { select: { name: status } },
        },
      });
      bot.sendMessage(msg.chat.id, `Marked task as "${status}".`, {
        reply_to_message_id: msg.message_id,
      });
    }
  };

  /**
   * @param {TelegramBot.Message} msg
   * @param {("note" | "task")} type
   */
  const updateType = async (msg, type = "task") => {
    const notesInDb = await getNotesFromDatabase();
    const note = notesInDb.results.filter((i) => {
      return (
        i.properties.message_id.number === msg?.reply_to_message?.message_id &&
        i.properties.type.select.name !== type
      );
    })[0];

    if (!note) {
      bot.sendMessage(
        msg.chat.id,
        `The message replied to is already of type ${type}`,
        {
          reply_to_message_id: msg.message_id,
        }
      );
      return;
    } else {
      try {
        await notion.pages.update({
          page_id: note.id,
          properties: {
            type: { select: { name: type } },
            ...(type === "task"
              ? {
                  status: { select: { name: "todo" } },
                }
              : {
                  status: { select: { name: "n/a" } },
                }),
          },
        });
        bot.sendMessage(msg.chat.id, `Marked message as type of "${type}".`, {
          reply_to_message_id: msg.message_id,
        });
      } catch (err) {
        bot.sendMessage(
          msg.chat.id,
          `Unable to change type. Error: "${err.toString()}".`,
          {
            reply_to_message_id: msg.message_id,
          }
        );
      }
    }
  };

  const getNotesFromDatabase = async () => {
    return await notion.request({
      path: "databases/" + DATABASE_ID + "/query",
      method: "POST",
    });
  };
};
