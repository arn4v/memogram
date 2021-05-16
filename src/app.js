const { Client } = require("@notionhq/client");
const TelegramBot = require("node-telegram-bot-api");

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

module.exports = async () => {
  const ADMIN_ID = JSON.parse(process.env.ADMIN_ID);
  const DATABASE_ID = process.env.DATABASE_ID;
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
    polling: true,
  });
  const AUX_COMMANDS = ["/todo", "/done", "/inprogress"];

  /**
   * @param {TelegramBot.Message} msg
   * @param {string} text
   * @param {boolean} [replyTo = true]
   */
  const sendAndDelete = async (msg, text, replyTo = true) => {
    const sentMessage = await bot.sendMessage(
      msg.chat.id,
      text,
      replyTo
        ? {
            reply_to_message_id: msg.message_id,
          }
        : {}
    );
    await sleep(5000);
    await bot.deleteMessage(sentMessage.chat.id, sentMessage.message_id);
  };

  bot.onText(/\/task (.+)/, async (msg, match) => {
    if (ADMIN_ID.includes(msg.from.id) && typeof match[1] !== "undefined") {
      if (!msg?.reply_to_message?.message_id) {
        await notion.request({
          path: "pages",
          method: "POST",
          body: {
            parent: { database_id: DATABASE_ID },
            properties: {
              Text: [{ text: { content: match[1] } }],
              message_id: msg.message_id,
              type: { name: "task" },
              status: { name: "todo" },
            },
          },
        });
        await sendAndDelete(msg, `Added new task: ${match[1]}.`);
      } else {
        await sendAndDelete(
          msg,
          "/task only works when you reply to a message sent using /note or /task command."
        );
      }
    } else {
      bot.sendMessage(msg, "You are not an admin.", false);
    }
  });

  bot.onText(/\/task/, async (msg, match) => {
    if (ADMIN_ID.includes(msg.from.id)) {
      if (
        match[0] === "/task" &&
        typeof match[1] === "undefined" &&
        typeof msg?.reply_to_message?.message_id !== "undefined" &&
        ["/task", "/note"].includes(
          msg?.reply_to_message?.text.match(/(\/task|\/note)/)[0]
        )
      ) {
        await updateType(msg, "task");
        console.log("Updating type to task");
      } else {
        if (typeof msg?.reply_to_message?.message_id !== "undefined") {
          await sendAndDelete(
            msg,
            "/task only works when you reply to a message sent using /note or /task command."
          );
        }
      }
    } else {
      await sendAndDelete(msg, "You are not an admin.", false);
    }
  });

  bot.onText(/\/note (.+)/, async (msg, match) => {
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
        await sendAndDelete(
          msg,
          "/note can be used to convert a task to a note or to add a new note. Usage: /note <note text>"
        );
      }
    } else {
      await sendAndDelete(msg, "You are not an admin.", false);
    }
  });

  bot.onText(/\/note/, async (msg, match) => {
    if (ADMIN_ID.includes(msg.from.id)) {
      if (match[0] === "/note") {
        if (
          typeof msg?.reply_to_message?.message_id !== "undefined" &&
          ["/task", "/note"].includes(
            msg?.reply_to_message?.text.match(/(\/task|\/note)/)[0]
          )
        ) {
          console.log("Updating type to note.");
          await updateType(msg, "note");
        } else {
          await sendAndDelete(
            msg,
            "/note can be used to convert a task to a note or to add a new note. Usage: /note <note text>"
          );
        }
      } else {
        await sendAndDelete(msg, "Invalid usage. Usage: /note <task text>");
      }
    } else {
      await sendAndDelete(msg, "You are not an admin.", false);
    }
  });

  bot.onText(/\/done/, async (msg, match) => {
    if (ADMIN_ID.includes(msg.from.id)) {
      if (
        msg?.reply_to_message?.message_id &&
        !AUX_COMMANDS.includes(msg?.reply_to_message.text) &&
        ["/task", "/note"].includes(
          msg?.reply_to_message?.text.match(/(\/task|\/note)/)[0]
        )
      ) {
        await updateStatus(msg, "done");
      } else {
        await sendAndDelete(
          msg,
          "/done only works when you reply to a note made using /quick command."
        );
      }
    } else {
      await sendAndDelete(msg, "You are not an admin.", false);
    }
  });

  bot.onText(/\/todo/, async (msg, match) => {
    if (ADMIN_ID.includes(msg.from.id)) {
      if (
        msg?.reply_to_message?.message_id &&
        !AUX_COMMANDS.includes(msg?.reply_to_message.text) &&
        ["/task", "/note"].includes(
          msg?.reply_to_message?.text.match(/(\/task|\/note)/)[0]
        )
      ) {
        await updateStatus(msg, "todo");
      } else {
        await sendAndDelete(
          msg,
          "/done only works when you reply to a note made using /quick command."
        );
      }
    } else {
      await sendAndDelete(msg, "You are not an admin.", false);
    }
  });

  bot.onText(/\/inprogress/, async (msg, match) => {
    if (ADMIN_ID.includes(msg.from.id)) {
      if (
        msg?.reply_to_message?.message_id &&
        !AUX_COMMANDS.includes(msg?.reply_to_message.text) &&
        ["/task", "/note"].includes(
          msg?.reply_to_message?.text.match(/(\/task|\/note)/)[0]
        )
      ) {
        await updateStatus(msg, "inprogress");
      } else {
        await sendAndDelete(
          msg,
          "/done only works when you reply to a note made using /quick command."
        );
      }
    } else {
      await sendAndDelete(msg, "You are not an admin.", false);
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
      await sendAndDelete(msg, 'The message replied to is not of type "note".');
      return;
    } else {
      await notion.pages.update({
        page_id: note.id,
        properties: {
          status: { select: { name: status } },
        },
      });
      await sendAndDelete(msg, `Marked task as "${status}".`);
      await bot.deleteMessage(msg.chat.id, msg.message_id);
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
      await sendAndDelete(
        msg,
        `The message replied to is already of type ${type}`
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
        await sendAndDelete(msg, `Marked message as type of "${type}".`);
        await bot.deleteMessage(msg.chat.id, msg.message_id);
      } catch (err) {
        await sendAndDelete(
          msg,
          `Unable to change type. Error: "${err.toString()}".`
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
