import { Message, TextChannel } from "discord.js";

const { Client, GatewayIntentBits } = require("discord.js");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const { format, startOfMinute, addMinutes, parseISO } = require("date-fns");

require("dotenv").config({ path: ".env.local" });

const prefix = "!";

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
  scheduleApiCheck();
});

// client.on("messageCreate", (message: Message) => {
//   if (message.author.bot) return;

//   console.log(`Received message: ${message.content}`);

//   if (message.content.startsWith(prefix)) {
//     const args = message.content.slice(prefix.length).trim().split(/ +/);
//     if(!args || args.length < 1){
//       return
//     }
//     const command = args.shift().toLowerCase();

//     if (command === "ping") {
//       message.reply("Pong!");
//     }
//   }
// });

client.login(process.env.DISCORD_BOT_TOKEN);

async function scheduleApiCheck() {
  // Set the desired time for the API check (2:50 PM CST in this example)
  const targetHour = 15; // 2 PM CST
  const targetMinute = 12;

  // Get the CST time zone
  const cstTimeZone = "America/Chicago";

  // Calculate the target time for the next check
  const now = new Date();
  const targetTime = startOfMinute(
    addMinutes(
      parseISO(format(now, "yyyy-MM-dd'T'HH:mm:ss")),
      targetMinute - now.getMinutes() + (targetHour - now.getHours()) * 60
    )
  );

  // Calculate the delay until the next target time
  let delay = targetTime.getTime() - now.getTime();
  if (delay < 0) {
    // If the target time has already passed, set it for the next day
    delay += 24 * 60 * 60 * 1000;
  }

  // Schedule the API check to run at the specified time every day
  setTimeout(async () => {
    await checkApiAndSendMessage();
    // Schedule the next API check
    scheduleApiCheck();
  }, delay);
}

async function checkApiAndSendMessage() {
  try {
    // Call your API
    const apiResponse = true;
    // print current time
    console.log("its time: ", new Date());

    // Check if the API response meets your condition
    if (apiResponse) {
      // Get the channel where you want to send the message
      const channel = client.channels.cache.get(
        process.env.ANNOUNCEMENT_CHANNEL_ID
      );

      if (channel instanceof TextChannel) {
        // Send a message to the channel
        channel.send("The API condition is met!");
      } else {
        console.error("The channel is not a text channel.");
      }
    }
  } catch (error: any) {
    console.error("Error checking API:", (error as Error).message);
  }
}
