require('dotenv').config();

const Discord = require('discord.js');
const client  = new Discord.Client();
const sqlite  = require('sqlite');
let   dbOpen  = sqlite.open('./db.sqlite3', { Promise });
const request = require('request-promise-native');

const lastFMAPIURL = 'http://ws.audioscrobbler.com/2.0/';

/**
 * A generic set of options for the request library that
 * gets changed based on the bot command sent.
 */
let lastFMAPIOptions = {
    url: lastFMAPIURL,
    qs: {
        'method': '',
        'user': '',
        'api_key': process.env.LAST_FM_API_KEY,
        'format': 'json'
    },
    json: true
};

/**
 * Handle setting a username to a Discord user.
 * 
 * Stores the association in an sqlite3 database.
 */
async function setLastFMUsername(message, lastFMUsername) {
    // make sure the user exists by trying to get info first
    lastFMAPIOptions.qs.method = 'user.getinfo';
    lastFMAPIOptions.qs.user   = lastFMUsername;

    try {
        const result = await request(lastFMAPIOptions);

        // grab the database
        const db = await dbOpen
            
        await db.run("REPLACE INTO discordLastFMUser (discordID, lastFMUsername) VALUES (?, ?)", [message.member.user.id, lastFMUsername]);

        message.reply(`Last.fm account with name "${lastFMUsername}" linked!`);
    }
    catch (e) {
        message.reply(`failed to find user with name: ${lastFMUsername}!`);
    }
}

/**
 * Grab the current playing track for the user that is associated
 * with the Discord message sender.
 */
async function getLastFMPlaying(message) {
    // grab the database
    const db = await dbOpen
    
    // try and grab the user association from sqlite
    try {
        const associationUser = await db.get("SELECT * FROM discordLastFMUser WHERE discordID = ?", message.member.user.id);

        if (associationUser === undefined) {
            message.reply('Looks like you haven\'t linked your Last.fm yet. Do it now by using the `set username` command.');

            return;
        }

        // set the options for getting the last.fm playing
        lastFMAPIOptions.qs.method = 'user.getrecenttracks';
        lastFMAPIOptions.qs.user   = associationUser.lastFMUsername;

        const result = await request(lastFMAPIOptions);

        // make sure track isn't empty and if so find the first one
        if (result.recenttracks.track.length === 0)
            return;
        
        const firstTrack = result.recenttracks.track[0];

        // check if there is a now playing attribute and if there is
        // build an embed for this track
        if (firstTrack.hasOwnProperty('@attr') && firstTrack["@attr"].nowplaying === "true")
        {
            const artist = firstTrack.artist["#text"];
            const title  = firstTrack.name;

            const embed = new Discord.RichEmbed()
                .setURL(`https://www.last.fm/user/${associationUser.lastFMUsername}`)
                .setTitle(`Now Playing`)
                .setColor(0xd51007)
                .setAuthor(associationUser.lastFMUsername)
                .addField(`${firstTrack.artist["#text"]} - ${firstTrack.name}`, `From the album "${firstTrack.album["#text"]}"`)
                .setTimestamp();

            if (firstTrack.image.length > 0)
                embed.setThumbnail(firstTrack.image[firstTrack.image.length - 1]["#text"]);

            message.channel.send({ embed: embed });
        }
    }
    catch (e) {
        return;
    }
}

/**
 * Handle a command sent to the wurlitzer bot.
 */
function handleCommand(message) {
    // grab the args of the message past the first one as that
    // should always be the mention for the command
    const args = message.content.split(' ').slice(1);

    // if the bot is just mentioned, grab the now playing
    if (args.length === 0)
    {
        getLastFMPlaying(message);
    }
    else if (args.length === 1 && args[0] === 'chart')
    {

    }
    else if (
        args.length === 3 &&
        args[0] === 'set' &&
        args[1] === 'username'
    )
    {
        setLastFMUsername(message, args[2]);
    }
}

/**
 * Init the wurlitzer database before use
 */
async function initDB() {
    // create the table if not already created
    const db = await dbOpen

    await db.run("CREATE TABLE IF NOT EXISTS discordLastFMUser (id INTEGER PRIMARY KEY AUTOINCREMENT, discordID TEXT UNIQUE, lastFMUsername TEXT)");
}

client.on('ready', () => {
    initDB();

    console.log(`logged in as ${client.user.tag}`);
});

client.on('message', message => {
    if (message.isMentioned(client.user))
        handleCommand(message);
});

client.login(process.env.DISCORD_BOT_KEY);