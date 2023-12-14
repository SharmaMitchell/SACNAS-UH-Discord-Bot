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

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
  scheduleApiCheck();
  getEventsData();
});

client.login(process.env.DISCORD_BOT_TOKEN);

interface GoogleSheetsResponse {
  range: string;
  majorDimension: string;
  values: string[][];
}

async function getEventsData() {
  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${process.env.EVENTS_SHEET_ID}/values/Upcoming!A2:J19?key=${process.env.GOOGLE_API_KEY}`
    );

    const data = (await response.json()) as GoogleSheetsResponse;

    console.log(data.values);

    if (data && data.values && data.values.length > 0) {
      // Get the current date in the format "Wednesday, January 24, 2024"
      const currentDate = format(new Date(), "EEEE, MMMM dd, yyyy");
      console.log(currentDate);

      // Filter events happening today
      const todayEvents = data.values.filter(
        (event) => event[3] === currentDate
      );

      console.log(todayEvents);

      if (todayEvents.length > 0) {
        // Get the channel where you want to send the message
        const channel = client.channels.cache.get(
          process.env.ANNOUNCEMENT_CHANNEL_ID
        );

        if (channel instanceof TextChannel) {
          // Announce each event happening today
          todayEvents.forEach((event) => {
            const [name, description, location, date, time, image] = event;

            // Build the message
            const message = `
              **Event:** ${name}
              **Description:** ${description}
              **Location:** ${location}
              **Date:** ${date}
              **Time:** ${time}
              **Event Image:** ${image}
            `;

            // Send the message to the channel
            channel.send(message);
          });
        } else {
          console.error("The channel is not a text channel.");
        }
      }
    }
  } catch (error: any) {
    console.error("Error checking API:", (error as Error).message);
  }
}

async function scheduleApiCheck() {
  // Set the desired time for the API check
  const targetHour = 15;
  const targetMinute = 15;

  // Get the CST time zone
  const cstTimeZone = "America/Chicago";

  // Calculate the target time for the next check
  const now = new Date();
  const targetTime = startOfMinute(
    addMinutes(
      parseISO(format(now, "yyyy-MM-dd'T'HH:mm:ss", { timeZone: cstTimeZone })),
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
