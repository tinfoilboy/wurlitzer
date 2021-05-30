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

const path = require("path");

const Database = require('better-sqlite3');
const User     = require('./user');
const { LastFM, Spotify }   = require('./api');

const Discord = require('discord.js');
const client  = new Discord.Client();

const { registerFont, createCanvas, loadImage } = require('canvas');

registerFont(
    path.join(__dirname, '/../fonts/NotoSans-Light.ttf'),
    { family: 'Noto Sans' }
);

registerFont(
    path.join(__dirname, '/../fonts/NotoSans-Regular.ttf'),
    { family: 'Noto Sans', weight: 'bold' }
);

const INVALID_LINK_TEXT = 'looks like you haven\'t linked your Last.fm yet. Do it now using the `link` command and specifying your Last.fm username after. Like this: `@wurlitzer link {last.fm username here}`';

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
        message.reply(INVALID_LINK_TEXT);

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

    if (fieldTitle.length > 256) {
        fieldTitle = fieldTitle.substr(0, 256 - 3) + "...";
    }

    if (fieldContent.length > 256) {
        fieldContent = fieldContent.substr(0, 256 - 3) + "...";
    }

    const embed = new Discord.MessageEmbed()
        .setColor(0xd51007)
        .setAuthor(user.lastFMUsername, await LastFM.getUserAvatarUrl(user.lastFMUsername), `https://www.last.fm/user/${user.lastFMUsername}`)
        .setTitle(fieldTitle)
        .setDescription(fieldContent + `\n\n[Listen on Spotify](${await Spotify.getTrackLink(`${result.title} artist:${result.artist} album:${result.album}`)})`);

    if (result.image.length > 0) {
        embed.setImage(result.image);
    }

    message.channel.send({ embed: embed });
    message.channel.stopTyping();
}

/**
 * Rudimentary text wrapping for album or artist names that are too long for
 * the canvas size and safe zone.
 * 
 * This will most likely only work with English.
 * 
 * @param ctx canvas context to draw to
 * @param x coordinate of where to start drawing the text starting from the left
 * @param y coordinate of where to start drawing the text starting from the bottom
 * @param push the amount to push the text up for beginning lines
 * @param width is the width to test for breaking text
 * @param top value to test whether the text is going above the top of the chart item
 * @param style text style of the wrapped text
 */
function drawWrappedText(ctx, x, y, push, text, width, top, size, style="normal") {
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
    // This line splitting is done by word, aka splits by space, and
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
    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    // reverse the array so that the lines are ordered from bottom to top, as we index backwards for the loop
    lines.reverse();
    let index = lines.length - 1;

    let smallestBottom = y;
    const initialBottom = y - (push * index);

    // If the text for the chart item is flowing over the top of the item, then we want to shrink the text as well as
    // the push factor by 0.75 until we do not have this overflow
    //
    // It might be a little more inefficient, however, all of this drawing code is inefficient, really should rewrite
    // this as a C module or something so I can just pass all the items to it!
    if (initialBottom - size < top) {
        return drawWrappedText(ctx, x, y, push * 0.75, text, width, top, size * 0.75, style);
    }

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
async function getChart(message, period, type, size) {
    // show that the bot is actively working
    message.channel.startTyping();

    // grab the database
    const db = new Database("db.sqlite3");
    const readablePeriod = period;

    if (period === "all") {
        period = "overall";
    }
    else if (period === "week") {
        period = "7day";
    }
    else if (period === "month") {
        period = "1month";
    }
    else if (period === "year") {
        period = "12month";
    }

    // try and parse the size of the chart. we don't allow for mixed width and height, but do allow for arbitrary size
    // up to 100. Width is at index 0 and height is at index 2 in the format {width}x{height}
    const sizeDelimiter = size.indexOf('x');
    const chartWidth  = parseInt(size.substr(0, sizeDelimiter));
    const chartHeight = parseInt(size.substr(sizeDelimiter + 1));

    if (chartWidth !== chartHeight) {
        message.reply(`chart width and height in the {width}x{height} format must match!`);
        message.channel.stopTyping();
        return;
    }

    if (chartWidth === 0 || chartHeight === 0) {
        message.reply(`chart size must not be zero!`);
        message.channel.stopTyping();
        return;
    }

    if (chartWidth > 10 || chartHeight > 10) {
        message.reply(`chart size can only go up to 10!`);
        message.channel.stopTyping();
        return;
    }

    // basically just a rename to itemCount for better readability
    const itemCount = chartWidth;

    // try and grab the user association from sqlite
    const user = User.get(db, message.member.user.id);
    if (user === undefined) {
        message.reply(INVALID_LINK_TEXT);
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
            itemCount * itemCount
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
            itemCount * itemCount
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
            itemCount * itemCount
        );
    
        if (result === undefined) {
            message.reply(`I could not seem to get a list of top ${type}s for the user in this period.`);
            message.channel.stopTyping();
            return;
        }

        items = result.artists;
    }

    // the size of the canvas to draw to, no separate width and height as it
    // should always be square, so double up on the values
    const canvasSize = 2000;

    // the size of each piece of art. this is the basis of the canvas size and might grow if we have less items than
    // we anticipated for the chart size.
    let itemSize = canvasSize / itemCount;

    // create a canvas to draw the 3x3
    const canvas = createCanvas(canvasSize, canvasSize)
    const ctx    = canvas.getContext('2d')

    let xOff = 0;
    let yOff = 0;

    // the safe zone for each image before flowing down should be 24
    const safeZone = itemSize * 0.075;

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

            ctx.drawImage(
                art,
                xOff,
                yOff,
                itemSize,
                itemSize
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

        const baseBottomFontSize = 18.0;
        const bottomSize = baseBottomFontSize + ((itemSize / itemCount) / (0.5 * baseBottomFontSize));
        const bottomPush = bottomSize * 1.25;
        const playText   = `${item.playCount} plays`;
        const playCountY = (yOff + itemSize) - safeZone;
        
        // draw the play count text first at the very bottom
        let playCountEnd = drawWrappedText(
            ctx,
            xOff + safeZone,
            playCountY,
            bottomPush,
            playText,
            itemSize - (safeZone * 2),
            yOff,
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
            yOff,
            bottomSize            
        ) : playCountEnd);

        // calculate size and line push for the track name
        const baseTopFontSize = 28.0;
        const topSize = baseTopFontSize + ((itemSize / itemCount) / (baseTopFontSize / 4.0));
        const topPush = topSize * 1.15;

        // draw the actual track/album name above all lines
        drawWrappedText(
            ctx,
            xOff + safeZone,
            artistEnd - bottomPush,
            topPush,
            item.name,
            itemSize - (safeZone * 2),
            yOff,
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
    const attachment = new Discord.MessageAttachment(stream);
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
 * Check if the string passed in is a chart size string.
 */
 function isChartSize(arg) {
    const delimiter = arg.indexOf('x');

    if (delimiter === -1) {
        return false;
    }

    const isLhsANumber = !isNaN(arg.substr(0, delimiter));
    const isRhsANumber = !isNaN(arg.substr(delimiter + 1));

    return isLhsANumber && isRhsANumber;
}

/**
 * Handle a command sent to the wurlitzer bot.
 */
function handleCommand(message) {
    // grab the args of the message past the first one as that
    // should always be the mention for the command
    const args = message.content.split(' ').slice(1).filter(arg => { return arg.length > 0; });

    // if the bot is just mentioned, grab the now playing
    if (args.length === 0) {
        getPlaying(message);
    }
    else if (args.length === 1 && args[0] === 'help') {
        // Longest string of all time, might be worth having an async read of a text file?
        message.reply("looks to me like you need some assistance!\nAny command, as you may be able to tell, is used by mentioning me, then specifying the command.\nYou'll first want to let me know your last.fm username, this can be done by typing `link` and then the username you'd like associated.\nOnce you've done that, you can simply mention me to grab what you're currently playing.\nAdditionally, you can mention me with the `chart` command to get a 3x3 chart from the current week.\nThis chart command also takes an extra value afterwards for the period of time for the chart, which can be either `all` for all time, `week` for the default weekly chart, or `month` for a monthly chart.\nYou can also specify the type of chart you want, either `artist`, `track`, or `album`, by default you get an album chart.\nYou can also create custom sized charts, all the way from 1x1 to 10x10. If you want to make one of these, specify the chart in that format, like `4x4`.\nThat's pretty much it, enjoy the bot!");
    }
    else if (args.length === 2 && args[0] === 'link') {
        setLastFMUsername(message, args[1]);
    }
    else if (args.length >= 1 && args[0] === 'chart') {
        let typeIndex   = -1;
        let periodIndex = -1;
        let sizeIndex   = -1;

        const chartArgs = args.slice(1);
        for (let i = 0; i < chartArgs.length; i++) {
            if (isChartType(chartArgs[i])) {
                typeIndex = i;
            }
            else if (isChartPeriod(chartArgs[i])) {
                periodIndex = i;
            }
            else if (isChartSize(chartArgs[i])) {
                sizeIndex = i;
            }
        }

        const period = (periodIndex <= -1) ? "week" : chartArgs[periodIndex];
        const type   = (typeIndex <= -1) ? "album" : chartArgs[typeIndex];
        const size   = (sizeIndex <= -1) ? "3x3" : chartArgs[sizeIndex];

        getChart(message, period, type, size);
    }
    else {
        message.reply("seems the command doesn't exist. Mention me with the command `help` and I can tell you commands and usage!");
    }
}

client.on('ready', () => {
    console.log(`logged in as ${client.user.tag}`);
});

client.on('message', message => {
    if (message.mentions.has(client.user))
        handleCommand(message);
});

client.login(process.env.DISCORD_BOT_KEY);
