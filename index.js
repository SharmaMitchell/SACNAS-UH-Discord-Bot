const { Client } = require("discord.js");
const client = new Client();
require("dotenv").config(); // Load environment variables from .env file

const prefix = "!";

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("message", (message) => {
  if (message.author.bot) return; // Ignore messages from other bots

  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Your command handling logic goes here

    // Example ping command
    if (command === "ping") {
      message.reply("Pong!");
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
