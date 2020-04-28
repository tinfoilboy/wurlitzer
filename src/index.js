/**
 * MIT License
 *
 * Copyright (c) 2020 Maxwell Flynn
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
const User     = require('./user');
const LastFM   = require('./last');

const Discord = require('discord.js');
const client  = new Discord.Client();

const { registerFont, createCanvas, loadImage } = require('canvas');

registerFont('fonts/NotoSans-Light.ttf',   { family: 'Noto Sans' });
registerFont('fonts/NotoSans-Regular.ttf', { family: 'Noto Sans', weight: 'bold' });

/**
 * Handle setting a username to a Discord user.
 * 
 * Stores the association in an sqlite3 database.
 */
async function setLastFMUsername(message, lastFMUsername) {
    // show that the bot is working
    message.channel.startTyping();

    // check if user exists
    const exists = await LastFM.checkUserExists(lastFMUsername);
    
    if (!exists) {
        message.reply(`failed to find Last.fm user named ${lastFMUsername}!`);

        message.channel.stopTyping();

        return;
    }

    const db = new Database("db.sqlite3");
            
    User.put(
        db,
        message.member.user.id,
        lastFMUsername
    );

    db.close();

    message.reply(`you've now linked a last.fm account with the name "${lastFMUsername}"!`);

    message.channel.stopTyping();
}

/**
 * Grab the current playing track for the user that is associated
 * with the Discord message sender.
 */
async function getPlaying(message) {
    // show a typing indicator for feedback
    message.channel.startTyping();

    // grab the database
    const db = new Database("db.sqlite3");
    
    // try and grab the user association from sqlite
    const user = User.get(db, message.member.user.id);

    if (user === undefined) {
        message.reply('looks like you haven\'t linked your Last.fm yet. Do it now by using the `set username` command.');

        db.close();
        
        message.channel.stopTyping();

        return;
    }

    db.close();

    const result = await LastFM.getUserPlaying(user.lastFMUsername);
    
    if (result === undefined) {
        message.reply(`I couldn't seem to find any recent tracks for ${user.lastFMUsername}.`);

        message.channel.stopTyping();

        return;
    }

    let fieldTitle = `${result.artist} - ${result.album}`;
    let fieldContent = `${result.title}`;

    if (fieldTitle.length > 256)
        fieldTitle = fieldTitle.substr(0, 256 - 3) + "...";

    if (fieldContent.length > 256)
        fieldContent = fieldContent.substr(0, 256 - 3) + "...";

    const embed = new Discord.RichEmbed()
        .setURL(`https://www.last.fm/user/${user.lastFMUsername}`)
        .setTitle(`Now Playing`)
        .setColor(0xd51007)
        .setAuthor(user.lastFMUsername)
        .addField(fieldTitle, fieldContent);

    if (result.image.length > 0)
        embed.setThumbnail(result.image);

    message.channel.send({ embed: embed });

    message.channel.stopTyping();
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
function drawWrappedText(ctx, x, y, push, text, width, size, style="normal") {
    ctx.font = `${style} ${size}px Noto Sans`;
    
    // truncate text to 80 characters to prevent overflow
    if (text.length > 80)
        text = text.substr(0, 80) + "...";

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
async function getChart(message, period, type) {
    // show that the bot is actively working
    message.channel.startTyping();

    // grab the database
    const db = new Database("db.sqlite3");
    
    const readablePeriod = period;

    if (period === "all")
        period = "overall";
    else if (period === "week")
        period = "7day";
    else if (period === "month")
        period = "1month"
    else if (period === "year")
        period = "12month";

    // try and grab the user association from sqlite
    const user = User.get(db, message.member.user.id);

    if (user === undefined) {
        message.reply('looks like you haven\'t linked your Last.fm yet. Do it now by using the `set username` command.');

        db.close();

        message.channel.stopTyping();

        return;
    }

    db.close();

    let result = undefined;
    let items  = undefined;

    if (type === "track") {
        result = await LastFM.getUserTopTracks(
            user.lastFMUsername,
            period,
            9
        );

        if (result === undefined) {
            message.reply(`I could not seem to get a list of top ${type}s for the user in this period.`);
        
            message.channel.stopTyping();

            return;
        }

        items = result.tracks;
    }
    else if (type === "album") {
        result = await LastFM.getUserTopAlbums(
            user.lastFMUsername,
            period,
            9
        );
    
        if (result === undefined) {
            message.reply(`I could not seem to get a list of top ${type}s for the user in this period.`);
        
            message.channel.stopTyping();

            return;
        }

        items = result.albums;
    }
    else if (type === "artist") {
        result = await LastFM.getUserTopArtists(
            user.lastFMUsername,
            period,
            9
        );
    
        if (result === undefined) {
            message.reply(`I could not seem to get a list of top ${type}s for the user in this period.`);
        
            message.channel.stopTyping();

            return;
        }

        items = result.artists;
    }

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

    // the size of each piece of art, this should always be 300
    // so that it fits the actual image width and height
    const itemSize = 300;

    ctx.fillStyle = "black";
    ctx.fillRect(
        0,
        0,
        canvasSize,
        canvasSize
    );

    for (const item of items) {
        if (item.art !== '') {
            const art = await loadImage(item.art);

            // make the image 300px x 300px
            ctx.drawImage(
                art,
                xOff,
                yOff,
                300,
                300
            );
        }

        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(
            xOff,
            yOff,
            xOff + itemSize,
            yOff + itemSize
        );

        ctx.fillStyle = "white";

        const playText   = `${item.playCount} plays`;
        const playCountY = (yOff + itemSize) - safeZone;
        const bottomSize = 18.0;
        const bottomPush = bottomSize * 1.25;
        
        // draw the play count text first at the very bottom
        let playCountEnd = drawWrappedText(
            ctx,
            xOff + safeZone,
            playCountY,
            bottomPush,
            playText,
            itemSize - (safeZone * 2),
            bottomSize
        );

        // draw the artist name text above the play count text
        //
        // also, do not draw the artist name if the type of chart is artist
        // as the artist name will be the main bold name
        let artistEnd = ((type !== "artist") ? drawWrappedText(
            ctx,
            xOff + safeZone,
            playCountEnd - bottomPush,
            bottomPush,
            item.artist,
            itemSize - (safeZone * 2),
            bottomSize            
        ) : playCountEnd);

        // calculate size and line push for the track name
        const topSize = 28.0;
        const topPush = topSize * 1.15;

        // draw the actual track/album name above all lines
        drawWrappedText(
            ctx,
            xOff + safeZone,
            artistEnd - bottomPush,
            topPush,
            item.name,
            itemSize - (safeZone * 2),
            topSize,
            "bold"
        );

        xOff += itemSize;

        // if the x offset is going to be greater than the image width,
        // then move on to the next row
        if (xOff >= canvasSize)
        {
            xOff  = 0;
            yOff += itemSize;
        }
    }

    const stream     = canvas.createPNGStream();
    const attachment = new Discord.Attachment(stream);

    const periodString = (readablePeriod != "all") ? `the ${readablePeriod}` : `all time`;

    message.channel.send(`Here's your top ${type}s of ${periodString}, ${message.author}.`, attachment);

    message.channel.stopTyping();
}

/**
 * Check if the string passed in is a chart type string.
 */
function isChartType(arg) {
    return arg === "album" || arg === "track" || arg === "artist";
}

/**
 * Check if the string passed in is a chart period string.
 */
function isChartPeriod(arg) {
    return arg === "all" || arg === "week" || arg === "year" || arg === "month";
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
        message.channel.send("You'll first want to let me know your last.fm username, this can be done by typing `link` and then the username you'd like associated.");
        message.channel.send("Once you've done that, you can simply mention me to grab what you're currently playing.");
        message.channel.send("Additionally, you can mention me with the `chart` command to get a 3x3 chart from the current week.")
        message.channel.send("This chart command also takes an extra value afterwards for the period of time for the chart, which can be either `all` for all time, `week` for the default weekly chart, or `month` for a monthly chart.");
        message.channel.send("That's pretty much it, enjoy the bot!");
    }
    else if (
        args.length === 2 &&
        args[0] === 'link'
    ) {
        setLastFMUsername(message, args[1]);
    }
    else if (
        args.length >= 1 &&
        args[0] === 'chart'
    ) {
        let typeIndex   = -1;
        let periodIndex = -1;

        if (args.length == 2) {
            if (isChartType(args[1]))
                typeIndex = 1;
            else if (isChartPeriod(args[1]))
                periodIndex = 1;
        }
        else if (args.length === 3) {
            if (isChartType(args[1]))
                typeIndex = 1;
            else if (isChartPeriod(args[1]))
                periodIndex = 1;

            if (isChartType(args[2]))
                typeIndex = 2;
            else if (isChartPeriod(args[2]))
                periodIndex = 2;
        }

        const period = (periodIndex <= -1) ? "week" : args[periodIndex];
        const type   = (typeIndex <= -1) ? "album" : args[typeIndex];

        getChart(message, period, type);
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
