const { Client, GatewayIntentBits } = require("discord.js");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
require("dotenv").config({ path: ".env.local" });

const prefix = "!";

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return; // Ignore messages from other bots

  console.log(`Received message: ${message.content}`);

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
