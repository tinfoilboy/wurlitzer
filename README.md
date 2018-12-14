# wurlitzer

## [If you'd just like to use this bot on your server, click here to invite it.](https://discordapp.com/oauth2/authorize?client_id=521880776740962316&scope=bot&permissions=52224)

A simple Discord bot for grabbing statistics for a Last.fm user.
Associate your Last.fm account with the bot and make subsequent calls to grab your stats.

## Usage

To begin using the bot, register a custom application for your bot instance on the [Discord Developers](https://discordapp.com/developers/applications/) page.
Once you've finished that and gotten a key for your bot user, make a `.env` file in the root with the following key:

    DISCORD_BOT_KEY=<your bot key here>

Next, register for a Last.fm API application [here](https://www.last.fm/api).
Take the key from registering the application and place it as well as the secret into the `.env` file like the following:

    LAST_FM_API_KEY=<your key here>
    LAST_FM_API_SECRET=<your secret here>

Once you are done, just run the script and enjoy the bot!

## Commands

For each command through the bot, you must mention it.
To begin using the bot with Last.fm, mention the bot and use the `set username` command, like the following

    @<bot name> set username <last.fm username>

This creates an association between your Discord account and the Last.fm account specified.
To get your Now Playing from Last.fm, just mention the bot with no arguments, like below:

    @<bot name>

This gives a rich card to what song is currently playing.

You can also get a 3x3 chart of your top albums of the week with the following command

    @<bot name> chart