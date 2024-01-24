# SACNAS-UH-Discord-Bot
Discord bot for SACNAS UH to automate event announcements and reminders.

![discord_bot_preview](https://github.com/SharmaMitchell/SACNAS-UH-Discord-Bot/assets/90817905/0ce2222e-f5a9-411f-b3b6-6420fbc87c62)

## Features
### Google Sheets Integration
The source of truth for events is a Google Sheet, containing event information including titles, descriptions, dates, images, and associated event links.
See the SACNAS-UH-Website [README](https://github.com/SharmaMitchell/SACNAS-UH-Website?tab=readme-ov-file#google-sheets-database) for details on Google Sheets usage, and Google Apps Script automation.
### Automated Event Announcement
This bot fetches event information from Google Sheets at a set interval (currently daily at a specific time). It then filters through events and announces events 1 week ahead of time, and again on the day of the event. 

All event announcements are logged, to avoid repeated announcements, and (in addition to the fetch on the set interval) event info is fetched upon bot startup, in case the bot happens to be down during the scheduled fetch interval.

Event announcements feature all event information, including titles, descriptions, dates, locations, images, and associated event links.
### Event Announcement Previews
Admins can preview upcoming event announcements using multiple methods.

Firstly, an automated reminder is sent to an admin channel 2 days prior to event announcements, with a preview of the announcement. This reminds admins to double-check event info and formatting before the announcement is sent out.

Upon making changes to event information, admins can manually preview an event announcement using the `!preview` command. By default, announcement previews will be generated for all upcoming events, but a specific event can be specified by adding a number that corresponds to the event's order in the upcoming events list. For example, `!preview 1` will generate an announcement preview only for the soonest upcoming event; `!preview 2` will generate a preview for the second upcoming event, etc.
### Discord Scheduled Event Creation
In addition to announcement messages, this bot also generates scheduled events within the discord server. This allows users to RSVP prior to the event, and persists in the server as a reminder of the upcoming event. These events are added to the server as soon as they are added to the Google Sheet (upon the next fetch interval), rather than being added in tandem with event announcement messages. This gives users a longer-term warning ahead of time, and provides a running list of upcoming events within the Discord server, that is consistent with the website and Google Sheet.
### Announcement and User Count
Upon startup, and upon each event announcement message, the bot's Discord status is updated to display the total number of announcements made and users in its server(s). The announcement count is based on the announcement log file.
### Upcoming Features
- Push event updates from Google Sheets to scheduled events in the Discord server
  - Currently, if an event is scheduled in the Discord server, and changes are made to the event in the Google Sheet, those changes are not reflected on Discord. This creates more work for admins, who have to manually update the Discord event.
- Add manual announcement option
  - This would allow admins to manually announce events, in case they weren't added to the Google Sheet more than 1 week in advance (thus the bot's 1 week announcement wouldn't go off), or in case of an error with the bot, such that events aren't announced on schedule.
- Auto-generated directions to event (pass event location into a Google Maps URL)
- Auto-generated "Add to Calendar" link (pass event info into a Google Calendar URL)
### Known Issues
- Event images are not added to Discord Scheduled Events
  - Images are included in the POST request to create the Discord event, but the response returns `image: null`.
  - This is on the backburner as it's not a severe breaking issue, but something I'd like to fix in the future.
### Self Hosting
If you'd like to fork the bot for your own usage, use the following instructions to set up your environment:
- Env variables
  - `DISCORD_BOT_TOKEN` - Your Discord bot token
  - `ANNOUNCEMENT_CHANNEL_ID` - The Discord channel ID for official announcements
  - `ADMIN_CHANNEL_ID` - The Discord channel for admin warnings and previews
  - `GOOGLE_API_KEY` - Your Google API Key (needs Google Sheets API access)
  - `EVENTS_SHEET_ID` - The Google Sheets ID for the source of truth for events
  - `DISCORD_GUILD_ID` - Your Discord Guild ID
- Google Sheets configuration
  | Title | Summary | Location | Date | Time | Image URL | Link 1 Label | Link 1 URL | Link 2 Label | Link 2 URL |
  | ------------ | ------------- | -------- | ---- | ---- | --------- | ------------ | ----------- | ------------ | ----------- |
  | My Event     | Come hang out! | Houston, TX | Wednesday, January 24, 2024 | 4:00 PM | https://i.imgur.com/eMMDrp2.jpeg | | | | |
- Note the format of dates: `EEEE, MMMM dd, yyyy`
  - This is formatted on the Google Sheet, and code in this repo is made to handle that format. You may need to adjust the code, or format your Google Sheets dates accordingly.
- Note that in my Google Sheets configuration, a sheet called "Upcoming" is used to store upcoming event data.
  - Previous events are automatically archived using Google Apps Script. See the SACNAS-UH-Website [README](https://github.com/SharmaMitchell/SACNAS-UH-Website?tab=readme-ov-file#google-sheets-database) for details
