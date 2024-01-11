import { TextChannel, PresenceData, ActivityType, Guild } from "discord.js";
import { promises as fsPromises } from "fs";
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

const EVENTS_API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.EVENTS_SHEET_ID}/values/Upcoming!A2:J19?key=${process.env.GOOGLE_API_KEY}`;
const LOG_FILE_PATH = "announcement_log.csv";

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Read the initial count from the announcement log
  const announcements = await readAnnouncementLog();
  const initialAnnouncementCount = announcements.length;

  // Fetch the number of users across all servers
  const totalUsers = client.guilds.cache.reduce(
    (accumulator: number, guild: Guild) => accumulator + guild.memberCount,
    0
  );

  // Set the initial status with the count
  setBotStatus(initialAnnouncementCount, totalUsers);

  scheduleApiCheck();
  getEventsData();
});

client.login(process.env.DISCORD_BOT_TOKEN);

interface GoogleSheetsResponse {
  range: string;
  majorDimension: string;
  values: string[][];
}

async function announceEvents(todayEvents: string[][], channel: TextChannel) {
  const announcements = await readAnnouncementLog();

  // Announce each event happening today
  todayEvents.forEach((event) => {
    const [name, description, location, date, time, image, ...links] = event;

    // Replace commas with underscores in date
    const sanitizedDate = date.replace(/,/g, "_");
    const announcementId = `${name}-${sanitizedDate}-${time}`;

    // Check if any announcement in the array contains the announcementId as a substring
    if (
      announcements.some((announcement) =>
        announcement.includes(announcementId)
      )
    ) {
      // console.log("Already announced this event.");
      return;
    } else {
      // console.log("Announcing this event.");
    }

    // Remove year from date
    const dateWithoutYear = date.replace(/, \d{4}$/, "");

    // Remove the 'l' at the end of the image url (imgur resizing)
    const fullSizeEventImage = image.replace(/l\./, ".");

    // Build the message
    let message = `Join us on **${dateWithoutYear}** at **${time}** for **${name}**!\n\n${description}\n\nLocation: **${location}**`;

    // Include event links if available
    for (let i = 0; i < links.length; i += 2) {
      const linkLabel = links[i];
      const linkUrl = links[i + 1];

      if (linkLabel && linkUrl) {
        message += `\n[${linkLabel}](<${linkUrl}>)`;
      }
    }

    // Add a newline before the image URL
    message += "\n";

    // Add the image URL to the message
    message += `${fullSizeEventImage}`;
    // Send the message to the channel
    channel.send(message);

    // Log the announcement with timestamp
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    const logEntry = `${timestamp},${announcementId}`;
    announcements.push(logEntry);
  });

  // Update the announcement log
  writeAnnouncementLog(announcements);
}

async function getEventsData() {
  try {
    const response = await fetch(EVENTS_API_URL);

    const data = (await response.json()) as GoogleSheetsResponse;

    console.log(data.values);

    if (data && data.values && data.values.length > 0) {
      // Get the current date in the format "Wednesday, January 24, 2024"
      const currentDate = format(new Date(), "EEEE, MMMM dd, yyyy");

      // const testDate = "Wednesday, January 24, 2024";

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
          await announceEvents(todayEvents, channel);
        } else {
          console.error("The channel is not a text channel.");
        }
      }
    }
  } catch (error: any) {
    console.error("Error checking API:", (error as Error).message);
  }
}

async function readAnnouncementLog(): Promise<string[]> {
  try {
    const data = await fsPromises.readFile(LOG_FILE_PATH, "utf-8");
    return data.split("\n").filter(Boolean);
  } catch (error: any) {
    return [];
  }
}

async function writeAnnouncementLog(announcements: string[]): Promise<void> {
  try {
    await fsPromises.writeFile(LOG_FILE_PATH, announcements.join("\n"));
  } catch (error: any) {
    console.error(
      "Error writing to announcement log:",
      (error as Error).message
    );
  }
}

async function scheduleApiCheck() {
  // Set the desired time for the API check
  const targetHour = 16;
  const targetMinute = 55;

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
    await getEventsData();
    // Schedule the next API check
    scheduleApiCheck();
  }, delay);
}

// Set bot's status to show the number of events announced
function setBotStatus(eventsAnnounced: number, totalUsers: number): void {
  const status: PresenceData = {
    activities: [
      {
        name: `${eventsAnnounced} events announced to ${totalUsers} Sacnistas!`,
        type: ActivityType.Custom,
      },
    ],
    status: "online",
  };

  client.user.setPresence(status);
}
