import {
  TextChannel,
  PresenceData,
  ActivityType,
  Guild,
  Message,
} from "discord.js";
import { REST } from "@discordjs/rest";
import {
  Routes,
  RESTPostAPIGuildScheduledEventJSONBody,
  RESTPostAPIGuildScheduledEventResult,
} from "discord-api-types/v10";
import { promises as fsPromises } from "fs";
import { add, differenceInDays, parse } from "date-fns";
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
const ANNOUNCEMENT_LOG_FILE_PATH = "./logs/announcement_log.csv";
const SCHEDULED_EVENTS_LOG_FILE_PATH = "./logs/scheduled_event_log.csv";
const ANNOUNCEMENT_WARNING_LOG_FILE_PATH =
  "./logs/announcement_warning_log.csv";

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Read the initial count from the announcement log
  const announcements = await readAnnouncementLog();
  const initialAnnouncementCount = announcements.length - 1;

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

client.on("messageCreate", async (message: Message) => {
  if (message.channel.id === process.env.ADMIN_CHANNEL_ID) {
    // Admin event announcement preview
    if (message.content.startsWith("!preview")) {
      try {
        // Extract the event index from the command
        const commandParts = message.content.split(" ");
        const eventIndex = parseInt(commandParts[1]);

        const response = await fetch(EVENTS_API_URL);

        if (!response.ok) {
          throw new Error("Failed to fetch events data.");
        }

        const data = (await response.json()) as GoogleSheetsResponse;

        if (data && data.values && data.values.length > 0) {
          const adminChannel = client.channels.cache.get(
            process.env.ADMIN_CHANNEL_ID
          );

          if (adminChannel instanceof TextChannel) {
            if (isNaN(eventIndex)) {
              // No number provided, send warnings for all events
              sendAnnouncementWarnings(data.values, adminChannel, true);
            } else if (eventIndex >= 1 && eventIndex <= data.values.length) {
              // Send the warning for the specified event
              sendAnnouncementWarnings(
                [data.values[eventIndex - 1]],
                adminChannel,
                true
              );
            } else {
              // Invalid index, send a message to inform the user
              message.channel.send(
                "Invalid event index. Please use a valid number."
              );
            }
          }
        } else {
          // No events found, send a message to inform the user
          message.channel.send("There are no events to preview.");
        }
      } catch (error) {
        // Handle any errors that occur during the preview
        console.error("An error occurred during the admin announcement preview (!preview):", error);
        message.channel.send("An error occurred while processing the command.");
      }
    }

    // Admin event announcement at given index (based on preview index)
    else if (message.content.startsWith("!announce")) {
      try {
        // Extract the event index from the command
        const commandParts = message.content.split(" ");
        const eventIndex = parseInt(commandParts[1]);

        const response = await fetch(EVENTS_API_URL);

        if (!response.ok) {
          throw new Error("Failed to fetch events data.");
        }

        const data = (await response.json()) as GoogleSheetsResponse;

        // inform user if there are no events
        if (data.values.length === 0) {
          message.channel.send("There are no events to announce.");
          return;
        }

        if (data && data.values && data.values.length > 0) {
          const channel = client.channels.cache.get(
            process.env.ANNOUNCEMENT_CHANNEL_ID
          );

          if (channel instanceof TextChannel) {
            if (
              !isNaN(eventIndex) &&
              eventIndex >= 1 &&
              eventIndex <= data.values.length
            ) {
              // Announce the specified event
              announceEvents([data.values[eventIndex - 1]], channel);
            } else {
              // Invalid index, send a message to inform the user
              message.channel.send(
                "Invalid event index. Please use a valid number, i.e. !announce 1"
              );
            }
          }
        }
      } catch (error) {
        console.error("An error occurred during announcement (!announce):", error);
        message.channel.send("An error occurred while processing the command.");
      }
    }

    // Admin channel !commands list
    else if (message.content.startsWith("!commands")) {
      try {
        const commands = [
          "`!preview [event index]` - Preview an event announcement in the admin channel",
          "`!announce [event index]` - Announce an event in the (public) announcement channel",
          "`!stats` - Display Discord bot stats (active time, server members, events announced, etc.)",
          "Note that events are automatically announced 1 week and 1 day before the event date.",
        ];

        message.channel.send(commands.join("\n"));
      } catch (error) {
        console.error("An error occurred while listing commands:", error);
        message.channel.send("An error occurred while processing the command.");
      }
    }

    // Admin channel !stats command (display bot stats)
    else if (message.content.startsWith("!stats")) {
      try {
        const timeActive = calculateTimeActive();

        const totalUsers = client.guilds.cache.reduce(
          (accumulator: number, guild: Guild) =>
            accumulator + guild.memberCount,
          0
        );

        const announcements = await readAnnouncementLog();
        const announcementCount = announcements.length - 1;

        const discordEvents = await readScheduledEventsLog();
        const discordEventsCount = discordEvents.length;

        const stats = [
          `Time active: ${timeActive}`,
          `Server members: ${totalUsers}`,
          `Events announced: ${announcementCount}`,
          `Discord events created: ${discordEventsCount}`,
        ];

        message.channel.send(stats.join("\n"));
      } catch (error) {
        console.error("An error occurred while fetching stats:", error);
        message.channel.send("An error occurred while processing the command.");
      }
    }
  }
});

interface GoogleSheetsResponse {
  range: string;
  majorDimension: string;
  values: string[][];
}

const rest = new REST({ version: "10" }).setToken(
  process.env.DISCORD_BOT_TOKEN!
);

async function scheduleAllEvents(events: string[][]) {
  events.forEach((event) => {
    const [name, description, location, date, time, image, ...links] = event;

    // Combine date and time to form a full datetime value
    const dateTimeString = date + " " + (time || "16:00"); // Default time to 4pm if not provided
    const startTime = new Date(dateTimeString);
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours past start time

    createDiscordEvent(name, description, image, startTime, endTime, location);
  });
}

async function createDiscordEvent(
  name: string,
  description: string,
  image: string,
  startTime: Date,
  endTime: Date,
  eventLocation: string
): Promise<string> {
  try {
    const eventData: RESTPostAPIGuildScheduledEventJSONBody = {
      name,
      description,
      image,
      entity_type: 3,
      scheduled_start_time: startTime.toISOString(),
      scheduled_end_time: endTime.toISOString(),
      privacy_level: 2,
      entity_metadata: { location: eventLocation },
    };

    const logDate = format(startTime, "yyyy");

    // Check if the event has been scheduled before creating it
    if (await isEventAlreadyScheduled(name, logDate)) {
      // Event is already scheduled, no need to create it again
      console.log("Discord Event already scheduled:", name);
      return "";
    }

    console.log(`Creating Discord Event: ${name}`)

    const event = (await rest.post(
      Routes.guildScheduledEvents(process.env.DISCORD_GUILD_ID!),
      { body: eventData }
    )) as RESTPostAPIGuildScheduledEventResult;

    console.log("Event creation response:", event);

    // Log the scheduled event with timestamp in the same format as the announcement log
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    const logEntry = `${timestamp},${name}-${logDate}-${event.id}`;
    const scheduledEventsLog = await readScheduledEventsLog();
    scheduledEventsLog.push(logEntry);
    await writeScheduledEventsLog(scheduledEventsLog);

    return event.id;
  } catch (error) {
    console.error("Error creating Discord event:", error);
    throw error;
  }
}

async function isEventAlreadyScheduled(
  name: string,
  logDate: string
): Promise<boolean> {
  const eventId = `${name}-${logDate}`;
  const scheduledEventsLog = await readScheduledEventsLog();
  return scheduledEventsLog.some((entry) => entry.includes(eventId));
}

async function sendAnnouncementWarnings(
  eventsToAnnounce: string[][],
  adminChannel: TextChannel,
  isManualPreview?: boolean
) {
  const warnings = await readWarningLog();
  const twoDaysLater = format(
    add(new Date(), { days: 2 }),
    "EEEE, MMMM dd, yyyy"
  );

  // Warn admins about upcoming event announcements
  eventsToAnnounce.forEach((event) => {
    const [name, description, location, date, time, image, ...links] = event;

    // Replace commas with underscores in date
    const sanitizedDate = date.replace(/,/g, "_");
    const announcementId = `${name}-${sanitizedDate}-${time}`;

    // Check if warning has already been made
    if (
      warnings.some(
        (announcement) =>
          announcement.includes(announcementId) &&
          (date !== twoDaysLater ||
            announcement.includes(
              format(add(new Date(), { days: 2 }), "yyyy-MM-dd")
            ))
      ) &&
      !isManualPreview
    ) {
      console.log("Already warned about this announcement.");
      return;
    }

    // Remove year from date
    const dateWithoutYear = date.replace(/, \d{4}$/, "");

    // Remove the 'l' at the end of the image url (imgur resizing)
    const fullSizeEventImage = image.replace(/l\./, ".");

    // Build the message
    const daysUntilEvent = differenceInDays(
      parse(date, "EEEE, MMMM dd, yyyy", new Date()),
      new Date()
    );
    const weekBeforeEvent = format(
      add(parse(date, "EEEE, MMMM dd, yyyy", new Date()), { days: -7 }),
      "EEEE, MMMM dd, yyyy"
    );
    const announcementDate = daysUntilEvent >= 6 ? weekBeforeEvent : date;
    const onDate =
      date === twoDaysLater ? "**today**" : `on **${dateWithoutYear}**`;
    const atTime = time !== "" ? ` at **${time}**` : "";
    const eventDescription = description !== "" ? `\n\n${description}` : "";
    const botInstructions = `To manually preview upcoming announcements in the admin channel, use !preview.`;

    const sanitizedLocation = location.replace(/ /g, "+");
    const directions = `[Directions via Google Maps](<https://www.google.com/maps/search/?api=1&query=${sanitizedLocation}>)`;

    const gcalDate = formatGCalDate(date, time);
    const sanitizedName = name.replace(/ /g, "+");
    const sanitizedDescription = description.replace(/ /g, "+");
    const calendarLink = `https://www.google.com/calendar/render?action=TEMPLATE&text=${sanitizedName}&dates=${gcalDate}&details=${sanitizedDescription}&location=${sanitizedLocation}&sf=true&output=xml`;
    const addtoCalButton = `[Add to Google Calendar](<${calendarLink}>)`;

    const adminWarning = `**WARNING: The following announcement will be posted on ${announcementDate}.**\nPlease ensure information is accurate and format is correct. ${botInstructions}\n\n`;

    let message = `${adminWarning}\`@here\` Join us ${onDate}${atTime} for **${name}**!${eventDescription}\n\nLocation: **${location}**  |  ${directions}  |  ${addtoCalButton}`;

    // Include event links if available
    for (let i = 0; i < links.length; i += 2) {
      const linkLabel = links[i];
      const linkUrl = links[i + 1];

      if (linkLabel && linkUrl) {
        message += `\n[${linkLabel}](<${linkUrl}>)`;
      }
    }

    // Add a newline before the image URL
    message += "\n\n";

    // Add the image URL to the message
    message += `${fullSizeEventImage}`;
    // Send the message to the channel
    adminChannel.send(message);

    // Log the announcement with timestamp
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    const logEntry = `${timestamp},${announcementId}`;
    warnings.push(logEntry);
  });

  // Update the announcement log (only for automatic warnings)
  if (!isManualPreview) {
    writeWarningLog(warnings);
  }
}

async function announceEvents(
  eventsToAnnounce: string[][],
  channel: TextChannel
) {
  const announcements = await readAnnouncementLog();
  const currentDate = format(new Date(), "EEEE, MMMM dd, yyyy");

  // Announce each event happening today, or one week from now
  eventsToAnnounce.forEach((event) => {
    const [name, description, location, date, time, image, ...links] = event;

    // Replace commas with underscores in date
    const sanitizedDate = date.replace(/,/g, "_");
    const announcementId = `${name}-${sanitizedDate}-${time}`;

    // Check if same-day announcement has already been made
    if (
      announcements.some(
        (announcement) =>
          announcement.includes(announcementId) &&
          (date !== currentDate ||
            announcement.includes(format(new Date(), "yyyy-MM-dd")))
      )
    ) {
      return;
    }

    // Remove year from date
    const dateWithoutYear = date.replace(/, \d{4}$/, "");

    // Remove the 'l' at the end of the image url (imgur resizing)
    const fullSizeEventImage = image.replace(/l\./, ".");

    // Build the message
    const onDate =
      date === currentDate ? "**today**" : `on **${dateWithoutYear}**`;
    const atTime = time !== "" ? ` at **${time}**` : "";
    const eventDescription = description !== "" ? `\n\n${description}` : "";

    const sanitizedLocation = location.replace(/ /g, "+");
    const directions = `[Directions via Google Maps](<https://www.google.com/maps/search/?api=1&query=${sanitizedLocation}>)`;

    const gcalDate = formatGCalDate(date, time);
    const sanitizedName = name.replace(/ /g, "+");
    const sanitizedDescription = description.replace(/ /g, "+");
    const calendarLink = `https://www.google.com/calendar/render?action=TEMPLATE&text=${sanitizedName}&dates=${gcalDate}&details=${sanitizedDescription}&location=${sanitizedLocation}&sf=true&output=xml`;
    const addtoCalButton = `[Add to Google Calendar](<${calendarLink}>)`;

    let message = `@here Join us ${onDate}${atTime} for **${name}**!${eventDescription}\n\nLocation: **${location}**  |  ${directions}  |  ${addtoCalButton}`;

    // Include event links if available
    for (let i = 0; i < links.length; i += 2) {
      const linkLabel = links[i];
      const linkUrl = links[i + 1];

      if (linkLabel && linkUrl) {
        message += `\n[${linkLabel}](<${linkUrl}>)`;
      }
    }

    // Add a newline before the image URL
    message += "\n\n";

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

  // Update bot status
  // Fetch the number of users across all servers
  const totalUsers = client.guilds.cache.reduce(
    (accumulator: number, guild: Guild) => accumulator + guild.memberCount,
    0
  );

  // Set the initial status with the count
  setBotStatus(announcements.length - 1, totalUsers);
}

async function getEventsData() {
  try {
    const response = await fetch(EVENTS_API_URL);

    const data = (await response.json()) as GoogleSheetsResponse;

    console.log('Google Sheets Events Data: ', data.values)

    if (data && data.values && data.values.length > 0) {
      // Add scheduled events to server
      scheduleAllEvents(data.values);

      // Announce events happening today, or one week from now

      // Get the current date in the format "Wednesday, January 24, 2024"
      const currentDate = format(new Date(), "EEEE, MMMM dd, yyyy");

      // Get the date for one week from today
      const oneWeekLater = add(new Date(), { weeks: 1 });
      const formattedOneWeekLater = format(oneWeekLater, "EEEE, MMMM dd, yyyy");

      // const testDate = "Wednesday, January 24, 2024";

      // Filter events happening today, or one week from now
      const eventsToAnnounce = data.values.filter(
        (event) =>
          event[3] === currentDate || event[3] === formattedOneWeekLater
      );

      console.log('Events to announce (today or on week from today)', eventsToAnnounce);

      if (eventsToAnnounce.length > 0) {
        // Get the channel where you want to send the message
        const channel = client.channels.cache.get(
          process.env.ANNOUNCEMENT_CHANNEL_ID
        );

        if (channel instanceof TextChannel) {
          await announceEvents(eventsToAnnounce, channel);
        } else {
          console.error("getEventsData error: The channel is not a text channel.");
        }
      }

      // Warn admins about upcoming announcements (2 days ahead)
      const twoDaysLater = format(
        add(new Date(), { days: 2 }),
        "EEEE, MMMM dd, yyyy"
      );
      const nineDaysLater = format(
        add(new Date(), { days: 9 }),
        "EEEE, MMMM dd, yyyy"
      );

      const eventsToWarn = data.values.filter(
        (event) => event[3] === twoDaysLater || event[3] === nineDaysLater
      );

      if (eventsToWarn.length > 0) {
        // Get admin channel id
        const adminChannel = client.channels.cache.get(
          process.env.ADMIN_CHANNEL_ID
        );

        if (adminChannel instanceof TextChannel) {
          await sendAnnouncementWarnings(eventsToWarn, adminChannel);
        } else {
          console.error("getEventsData error: The channel is not a text channel.");
        }
      }
    }
  } catch (error: any) {
    console.error("getEventsData Error checking API:", (error as Error).message);
  }
}

async function readAnnouncementLog(): Promise<string[]> {
  try {
    const data = await fsPromises.readFile(ANNOUNCEMENT_LOG_FILE_PATH, "utf-8");
    return data.split("\n").filter(Boolean);
  } catch (error: any) {
    console.error("readAnnouncementLog error: ", (error as Error).message)
    return [];
  }
}

async function writeAnnouncementLog(announcements: string[]): Promise<void> {
  try {
    await fsPromises.writeFile(
      ANNOUNCEMENT_LOG_FILE_PATH,
      announcements.join("\n")
    );
  } catch (error: any) {
    console.error(
      "Error writing to announcement log:",
      (error as Error).message
    );
  }
}

async function readScheduledEventsLog(): Promise<string[]> {
  try {
    const data = await fsPromises.readFile(
      SCHEDULED_EVENTS_LOG_FILE_PATH,
      "utf-8"
    );
    return data.split("\n").filter(Boolean);
  } catch (error: any) {
    console.error("readScheduledEventsLog error: ", (error as Error).message)

    return [];
  }
}

async function writeScheduledEventsLog(events: string[]): Promise<void> {
  try {
    await fsPromises.writeFile(
      SCHEDULED_EVENTS_LOG_FILE_PATH,
      events.join("\n")
    );
  } catch (error: any) {
    console.error(
      "Error writing to announcement log:",
      (error as Error).message
    );
  }
}

async function readWarningLog(): Promise<string[]> {
  try {
    const data = await fsPromises.readFile(
      ANNOUNCEMENT_WARNING_LOG_FILE_PATH,
      "utf-8"
    );
    return data.split("\n").filter(Boolean);
  } catch (error: any) {
    console.error("readWarningLog error: ", (error as Error).message)
    return [];
  }
}

async function writeWarningLog(events: string[]): Promise<void> {
  try {
    await fsPromises.writeFile(
      ANNOUNCEMENT_WARNING_LOG_FILE_PATH,
      events.join("\n")
    );
  } catch (error: any) {
    console.error(
      "Error writing to announcement log:",
      (error as Error).message
    );
  }
}

async function scheduleApiCheck() {
  try{
  // Set the desired time for the API check
  const targetHour = 9;
  const targetMinute = 0;

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
} catch (error: any) {
  console.error("scheduleApiCheck error: ", (error as Error).message)
}
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

// Calculate time bot has been active, from Jan 25 2024 at 5pm
function calculateTimeActive(): string {
  const startDate = new Date("2024-01-25T17:00:00");
  const currentDate = new Date();

  const timeDifference = currentDate.getTime() - startDate.getTime();

  // Calculate years
  const years = Math.floor(timeDifference / (1000 * 60 * 60 * 24 * 365.25));

  // Calculate months
  const months = Math.floor(
    (timeDifference % (1000 * 60 * 60 * 24 * 365.25)) /
      (1000 * 60 * 60 * 24 * 30.4375)
  );

  // Calculate days
  const days = Math.floor(
    (timeDifference % (1000 * 60 * 60 * 24 * 30.4375)) / (1000 * 60 * 60 * 24)
  );

  return `${years} years, ${months} months, ${days} days`;
}

function formatGCalDate(date: string, time: string) {
  let formattedCalDates = date;
  if (date) {
    let calendarDateNum = Date.parse(date);
    let calendarDateISO = new Date(calendarDateNum);
    let day = calendarDateISO.getDate().toString();
    let month = (calendarDateISO.getMonth() + 1).toString();
    if (month.length < 2) {
      month = "0" + month;
    }
    let year = calendarDateISO.getFullYear().toString();
    let calendarDate = year + month + day;

    let calendarStartTime =
      time
        .replace(":", "")
        .replace(/(AM|PM)/, "")
        .replace(" ", "") + "00";
    if (calendarStartTime.length < 6) {
      calendarStartTime = "0" + calendarStartTime;
    }
    if (time.indexOf("PM") !== -1) {
      calendarStartTime = (Number(calendarStartTime) + 120000).toString();
    }
    let calendarEndTime = (Number(calendarStartTime) + 20000).toString(); // End time 2 hours after

    formattedCalDates =
      calendarDate +
      "T" +
      calendarStartTime +
      "/" +
      calendarDate +
      "T" +
      calendarEndTime;
  }
  return formattedCalDates;
}
