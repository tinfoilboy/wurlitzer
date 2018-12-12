require('dotenv').config();

const Discord = require('discord.js');
const client = new Discord.Client();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('db.sqlite3');
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
 * Create the tables for the database if it doesn't already exist.
 */
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS discordLastFMUser (id INTEGER PRIMARY KEY AUTOINCREMENT, discordID TEXT UNIQUE, lastFMUsername TEXT)");
});

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

        db.serialize(() => {
            const insertStatement = db.prepare("REPLACE INTO discordLastFMUser (discordID, lastFMUsername) VALUES (?, ?)");
            
            insertStatement.run(message.member.user.id, lastFMUsername);

            insertStatement.finalize();
        });

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
    
}

/**
 * Handle a command sent to the wurlitzer bot.
 */
function handleCommand(message) {
    // grab the args of the message past the first one as that
    // should always be the mention for the command
    const args = message.content.split(' ').slice(1);

    // if the bot is just mentioned, grab the now playing
    if (args.length == 0)
    {
        getLastFMPlaying(message);
    }
    else if (
        args.length == 3 &&
        args[0] == 'set' &&
        args[1] == 'username'
    )
    {
        setLastFMUsername(message, args[2]);
    }
}

client.on('ready', () => {
    console.log(`logged in as ${client.user.tag}`);
});

client.on('message', message => {
    if (message.isMentioned(client.user))
        handleCommand(message);
});

process.on('SIGINT', () => {
    db.close();
});

client.login(process.env.DISCORD_BOT_KEY);