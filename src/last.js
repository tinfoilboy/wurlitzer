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
const request = require('request-promise-native');

/**
 * The URL for the Last.fm API.
 */
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
 * Simple class for accessing the Last.fm API.
 * 
 * Contains all methods needed to grab from the API and return for functions.
 */
class LastFM {
    static async checkUserExists(username) {
        lastFMAPIOptions.qs.method = 'user.getinfo';
        lastFMAPIOptions.qs.user   = username;

        try {
            const result = await request(lastFMAPIOptions);

            return true;
        }
        catch (e)
        {
            return false;
        }
    }

    static async getUserPlaying(username) {
        try {
            // set the options for getting the last.fm playing
            lastFMAPIOptions.qs.method = 'user.getrecenttracks';
            lastFMAPIOptions.qs.user   = username;

            const result = await request(lastFMAPIOptions);

            if (result.recenttracks.track.length === 0)
                return undefined;

            const first = result.recenttracks.track[0];

            return {
                artist: first.artist['#text'],
                title:  first.name,
                album:  first.album['#text'],
                image:  first.image[first.image.length - 1]['#text']
            }
        }
        catch (e) {
            console.log(e);

            return undefined;
        }
    }

    static async getUserTopAlbums(username, period, count) {
        lastFMAPIOptions.qs.method = 'user.gettopalbums';
        lastFMAPIOptions.qs.user   = username;
        lastFMAPIOptions.qs.period = period;

        try {
            const result = await request(lastFMAPIOptions);

            const length = result.topalbums.album.length;

            if (length <= 0)
                return undefined;

            let albums = [];

            for (let i = 0; i < count; i++)
            {
                const album = result.topalbums.album[i];

                albums.push({
                    art: album.image[album.image.length - 1]["#text"],
                    playCount: result.topalbums.album[i].playcount,
                    name: album.name,
                    artist: album.artist.name
                });
            }

            return albums;
        }
        catch (e) {
            console.log(e);

            return undefined;
        }
    }
}

module.exports = LastFM;