/**
 * MIT License
 *
 * Copyright (c) 2019 Maxwell Flynn
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const User = require('./user');

const Discord = require('discord.js');
const client  = new Discord.Client();
const request = require('request-promise-native');
const { createCanvas, loadImage } = require('canvas');

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
    headers: {
        "User-Agent": "wurlitzer discord bot"
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

        const db = new Database("db.sqlite3");
            
        User.put(db, message.member.user.id, lastFMUsername);

        db.close();

        message.reply(`you've now linked a last.fm account with the name "${lastFMUsername}"!`);
    }
    catch (e) {
        message.reply(`Failed to find Last.fm user named ${lastFMUsername}!`);
    }
}

/**
 * Grab the current playing track for the user that is associated
 * with the Discord message sender.
 */
async function getPlaying(message) {
    // grab the database
    const db = new Database("db.sqlite3");
    
    // try and grab the user association from sqlite
    try {
        const user = User.get(db, message.member.user.id);

        if (user === undefined) {
            message.reply('looks like you haven\'t linked your Last.fm yet. Do it now by using the `set username` command.');

            db.close();

            return;
        }

        db.close();

        // set the options for getting the last.fm playing
        lastFMAPIOptions.qs.method = 'user.getrecenttracks';
        lastFMAPIOptions.qs.user   = user.lastFMUsername;

        const result = await request(lastFMAPIOptions);

        // make sure track isn't empty and if so find the first one
        if (result.recenttracks.track.length === 0)
            return;
        
        const firstTrack = result.recenttracks.track[0];

        // return the most recent track as "now playing"
        const artist = firstTrack.artist["#text"];
        const title  = firstTrack.name;
        const album  = firstTrack.album["#text"];

        const embed = new Discord.RichEmbed()
            .setURL(`https://www.last.fm/user/${user.lastFMUsername}`)
            .setTitle(`Now Playing`)
            .setColor(0xd51007)
            .setAuthor(user.lastFMUsername)
            .addField(`${artist} - ${title}`, `From the album "${album}"`)
            .setTimestamp();

        if (firstTrack.image.length > 0)
            embed.setThumbnail(firstTrack.image[firstTrack.image.length - 1]["#text"]);

        message.channel.send({ embed: embed });
    }
    catch (e) {
        console.error(e);

        db.close();

        return;
    }
}

/**
 * Rudamentary text wrapping for album or artist names that are too long for
 * the canvas size and safezone.
 * 
 * This will most likely only work with English.
 * 
 * ctx is the canvas context
 * x and y are the coordinates of the bottom line
 * push is the amount to push the album text up for beginning lines
 * width is the width to test for breaking text
 */
function drawWrappedText(ctx, x, y, push, text, width) {
    const wholeLineWidth = ctx.measureText(text).width;

    if (wholeLineWidth <= width)
    {
        ctx.fillText(text, x, y);
    
        return y;
    }

    // Now, since the initial line test failed, try and break apart the line
    // into multiple lines, sometimes only one extra line may be required.
    //
    // This line splitting is done by word, aka splits each word by space, and
    // tests adding word by word until width is filled.
    const words       = text.split(' ');
    let   lines       = [];
    let   currentLine = "";

    words.forEach((value) => {
        // test the width for the current line and add to the lines array if
        // too big with the new word added to the end
        const lineWidth = ctx.measureText(currentLine + value + " ").width;

        if (lineWidth >= width)
        {
            lines.push(currentLine);

            currentLine = "";
        }

        // add the value and a space to the current line
        currentLine += value + " ";
    });

    // push the last line to the lines array if not empty
    if (currentLine.length > 0)
        lines.push(currentLine);

    // reverse the array for index ease of use
    lines.reverse();

    // iterate through the array backwards and fill text top to bottom
    let index = lines.length - 1;

    let smallestBottom = y;

    while (index >= 0)
    {
        let bottom = y - (push * index);

        ctx.fillText(
            lines[index],
            x,
            bottom
        );

        if (bottom < smallestBottom)
            smallestBottom = bottom;

        index--;
    }

    return smallestBottom;
}

/**
 * Create an image chart for the user based on the timeframe they specify.
 */
async function getChart(message, period) {
    // grab the database
    const db = new Database("db.sqlite3");
    
    if (period === "all")
        period = "overall";
    else if (period === "week")
        period = "7day";
    else if (period === "year")
        period = "12month";

    // try and grab the user association from sqlite
    try {
        const user = User.get(db, message.member.user.id);

        if (user === undefined) {
            message.reply('looks like you haven\'t linked your Last.fm yet. Do it now by using the `set username` command.');

            db.close();

            return;
        }

        db.close();

        // set the options for getting the last.fm playing
        lastFMAPIOptions.qs.method = 'user.gettopalbums';
        lastFMAPIOptions.qs.user   = user.lastFMUsername;
        lastFMAPIOptions.qs.period = period;

        const result = await request(lastFMAPIOptions);

        // the size of the canvas to draw to, no seperate width and height as it
        // should always be square, so double up on the values
        const canvasSize = 900;

        // create a canvas to draw the 3x3
        const canvas = createCanvas(canvasSize, canvasSize)
        const ctx    = canvas.getContext('2d')

        let xOff = 0;
        let yOff = 0;

        // the safe zone for each image before flowing down should be 24
        const safeZone = 24;

        // the size of each piece of album art, this should always be 300
        // so that it fits the actual image width and height
        const albumSize = 300;

        ctx.fillStyle = "black";
        ctx.fillRect(
            0,
            0,
            canvasSize,
            canvasSize
        );

        let count = result.topalbums.album.length;

        if (count > 9)
            count = 9;

        for (let i = 0; i < count; i++) {
            const album = result.topalbums.album[i];
            
            if (album.image[album.image.length - 1]["#text"] !== '') {
                const albumArt = await loadImage(album.image[album.image.length - 1]["#text"]);

                ctx.drawImage(
                    albumArt,
                    xOff,
                    yOff
                );
            }

            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.fillRect(
                xOff,
                yOff,
                xOff + albumSize,
                yOff + albumSize
            );

            ctx.fillStyle = "white";
            ctx.font = "18px sans-serif";

            const artistY = (yOff + albumSize) - safeZone;
            
            let artistEnd = drawWrappedText(
                ctx,
                xOff + safeZone,
                artistY,
                safeZone,
                album.artist.name,
                albumSize - (safeZone * 2)
            );

            // push by an extra safe zone before drawing another text
            if (artistEnd !== artistY)
                artistEnd -= safeZone / 4;

            ctx.font = "bold 20px sans-serif";            

            drawWrappedText(
                ctx,
                xOff + safeZone,
                artistEnd - (safeZone),
                safeZone,
                album.name,
                albumSize - (safeZone * 2)
            );

            xOff += albumSize;

            // if the x offset is going to be greater than the image width,
            // then move on to the next row
            if (xOff >= canvasSize)
            {
                xOff  = 0;
                yOff += albumSize;
            }
        }

        const stream     = canvas.createPNGStream();
        const attachment = new Discord.Attachment(stream);

        message.channel.send(`Here's your chart, ${message.author}.`, attachment);
    }
    catch (e) {
        db.close();

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
    if (args.length === 0) {
        getPlaying(message);
    }
    else if (
        args.length === 1 &&
        args[0] === 'help'
    ) {
        message.reply("looks to me like you need some assistance!");
        message.channel.send("Any command, as you may be able to tell, is used by mentioning me, then specifying the command.");
        message.channel.send("You'll first want to let me know your last.fm username, this can be done by typing `set username` and then the username you'd like associated.");
        message.channel.send("Once you've done that, you can simply mention me to grab what you're currently playing.");
        message.channel.send("Additionally, you can mention me with the `chart` command to get a 3x3 chart from the current week.")
        message.channel.send("This chart command also takes an extra value afterwards for the period of time for the chart, which can be either `all` for all time, `week` for the default weekly chart, or `month` for a monthly chart.");
        message.channel.send("That's pretty much it, enjoy the bot!");
    }
    else if (
        args.length === 3 &&
        args[0] === 'set' &&
        args[1] === 'username'
    ) {
        setLastFMUsername(message, args[2]);
    }
    else if (
        args.length >= 1 &&
        args[0] === 'chart'
    ) {
        const period = (args[1] === undefined) ? "week" : args[1];

        if (period !== "all" && period !== "week" && period !== "year")
        {
            message.reply("please use a valid time period for the chart command.");
            message.channel.send(`The correct periods are "all", "week", or "year".`);
        }
        else
            getChart(message, period);
    }
    else
        message.reply("I'm afraid that command doesn't exist.")
}

client.on('ready', () => {
    console.log(`logged in as ${client.user.tag}`);
});

client.on('message', message => {
    if (message.isMentioned(client.user))
        handleCommand(message);
});

client.login(process.env.DISCORD_BOT_KEY);
