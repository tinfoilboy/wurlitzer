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
const request = require('request-promise-native');

let SpotifyClient     = undefined;
let SpotifyAuthClient = undefined;

// if we actually have a Spotify API key to use, use it!
if (process.env.SPOTIFY_CLIENT_ID !== undefined) {
    const SpotifyAPI = require('spotify-web-api-node');

    console.log("Logging into the Spotify API!");

    SpotifyClient = new SpotifyAPI({
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET
    });

    SpotifyAuthClient = () => {
        SpotifyClient.clientCredentialsGrant().then(
        data => {
            SpotifyClient.setAccessToken(data.body['access_token']);
        },
        err => {
            console.error(err);
        });
    }

    // grab a spotify access token
    SpotifyAuthClient();
}

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
        lastFMAPIOptions.qs.method  = 'user.getinfo';
        lastFMAPIOptions.qs.api_key = process.env.LAST_FM_API_KEY;
        lastFMAPIOptions.qs.user    = username;
        lastFMAPIOptions.qs.format  = 'json';

        try {
            const result = await request(lastFMAPIOptions);

            lastFMAPIOptions.qs = {};

            return true;
        }
        catch (e)
        {
            lastFMAPIOptions.qs = {};

            return false;
        }
    }

    static async getUserPlaying(username) {
        // set the options for getting the last.fm playing
        lastFMAPIOptions.qs.method  = 'user.getrecenttracks';
        lastFMAPIOptions.qs.api_key = process.env.LAST_FM_API_KEY;
        lastFMAPIOptions.qs.user    = username;
        lastFMAPIOptions.qs.format  = 'json';
        
        try {
            const result = await request(lastFMAPIOptions);

            lastFMAPIOptions.qs = {};

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

            lastFMAPIOptions.qs = {};

            return undefined;
        }
    }

    static async getUserTopAlbums(username, period, count) {
        lastFMAPIOptions.qs.method  = 'user.gettopalbums';
        lastFMAPIOptions.qs.api_key = process.env.LAST_FM_API_KEY;
        lastFMAPIOptions.qs.user    = username;
        lastFMAPIOptions.qs.period  = period;
        lastFMAPIOptions.qs.format  = 'json';

        try {
            const result = await request(lastFMAPIOptions);

            lastFMAPIOptions.qs = {};

            const length = result.topalbums.album.length;

            if (length <= 0)
                return undefined;

            let albums         = [];
            let totalPlayCount = 0;

            for (let i = 0; i < count; i++)
            {
                const album = result.topalbums.album[i];

                let albumArt = await this._grabSpotifyArt(
                    "album",
                    `${album.name} artist:${album.artist.name}`
                );

                if (albumArt === null || albumArt === undefined)
                {
                    albumArt = album.image[album.image.length - 1]["#text"];
                }

                totalPlayCount += parseInt(album.playcount);

                albums.push({
                    art: albumArt,
                    playCount: parseInt(album.playcount),
                    name: album.name,
                    artist: album.artist.name
                });
            }

            return { albums: albums, totalPlayCount: totalPlayCount };
        }
        catch (e) {
            console.log(e);

            lastFMAPIOptions.qs = {};

            return undefined;
        }
    }

    static async getUserTopArtists(username, period, count) {
        lastFMAPIOptions.qs.method  = 'user.gettopartists';
        lastFMAPIOptions.qs.api_key = process.env.LAST_FM_API_KEY;
        lastFMAPIOptions.qs.user    = username;
        lastFMAPIOptions.qs.period  = period;
        lastFMAPIOptions.qs.format  = 'json';

        try {
            const result = await request(lastFMAPIOptions);

            lastFMAPIOptions.qs = {};

            const length = result.topartists.artist.length;

            if (length <= 0)
                return undefined;

            let artists        = [];
            let totalPlayCount = 0;

            for (let i = 0; i < count; i++)
            {
                const artist = result.topartists.artist[i];

                totalPlayCount += parseInt(artist.playcount);

                let artistArt = await this._grabSpotifyArt(
                    "artist",
                    artist.name
                );

                if (artistArt === null || artistArt === undefined)
                {
                    artistArt = artist.image[artist.image.length - 1]["#text"];
                }

                artists.push({
                    art: artistArt,
                    playCount: parseInt(artist.playcount),
                    name: artist.name
                });
            }

            return { artists: artists, totalPlayCount: totalPlayCount };
        }
        catch (e) {
            console.log(e);

            lastFMAPIOptions.qs = {};

            return undefined;
        }
    }

    static async getUserTopTracks(username, period, count) {
        lastFMAPIOptions.qs.method  = 'user.gettoptracks';
        lastFMAPIOptions.qs.api_key = process.env.LAST_FM_API_KEY;
        lastFMAPIOptions.qs.user    = username;
        lastFMAPIOptions.qs.period  = period;
        lastFMAPIOptions.qs.format  = 'json';

        try {
            const result = await request(lastFMAPIOptions);

            lastFMAPIOptions.qs = {};

            const length = result.toptracks.track.length;

            if (length <= 0)
                return undefined;

            let tracks         = [];
            let totalPlayCount = 0;

            for (let i = 0; i < count; i++)
            {
                const track = result.toptracks.track[i];

                let art = await this._grabSpotifyArt(
                    "track",
                    `${track.name} artist:${track.artist.name}`
                );

                // try and fall back to artist art if track art cannot be found
                if (art === null || art === undefined)
                {
                    console.log(art);

                    art = await this._grabSpotifyArt(
                        "artist",
                        track.artist.name
                    );
                }

                if (art === null || art === undefined)
                {
                    art = await this.getTrackArt(track.name, track.artist.name);

                    if (art === undefined)
                        art = track.image[track.image.length - 1]["#text"];
                }

                totalPlayCount += parseInt(track.playcount);

                tracks.push({
                    art: art,
                    playCount: parseInt(track.playcount),
                    name: track.name,
                    artist: track.artist.name
                });
            }

            return { tracks: tracks, totalPlayCount: totalPlayCount };
        }
        catch (e) {
            console.log(e);

            lastFMAPIOptions.qs = {};

            return undefined;
        }
    }

    static async getTrackArt(title, artist) {
        lastFMAPIOptions.qs.method      = 'track.getinfo';
        lastFMAPIOptions.qs.api_key     = process.env.LAST_FM_API_KEY;
        lastFMAPIOptions.qs.artist      = artist;
        lastFMAPIOptions.qs.track       = title;
        lastFMAPIOptions.qs.format      = 'json';

        try {
            const result = await request(lastFMAPIOptions);

            lastFMAPIOptions.qs = {};

            if (result.track.album !== undefined && result.track.album.image !== undefined)
                return result.track.album.image[result.track.album.image.length - 1]["#text"];
            else
                return undefined;
        }
        catch (e) {
            console.log(e);

            lastFMAPIOptions.qs = {};

            return undefined;
        }
    }

    static async _grabSpotifyArt(type, name) {
        let artURL = "";

        if (SpotifyClient === undefined) {
            return null;
        }

        if (type === "artist") {
            await SpotifyClient.searchArtists(name).then(
            data => {
                if (data.body.artists.items.length <= 0)
                {
                    artURL = null;

                    return;
                }

                // get the mid-sized image as it will fit the chart better
                artURL = data.body.artists.items[0].images[1].url;
            },
            err => {
                // if authentication failed, retry the grab with new credentials
                if (err.statusCode === 401) {
                    SpotifyAuthClient();

                    return this._grabSpotifyArt(type, name);
                }
            });
        }
        else if (type === "album") {
            await SpotifyClient.searchAlbums(name).then(
            data => {
                if (data.body.albums.items.length <= 0)
                {
                    artURL = null;

                    return;
                }

                // get the mid-sized image as it will fit the chart better
                artURL = data.body.albums.items[0].images[1].url;
            },
            err => {
                // if authentication failed, retry the grab with new credentials
                if (err.statusCode === 401) {
                    SpotifyAuthClient();

                    return this._grabSpotifyArt(type, name);
                }
            });
        }
        else if (type === "track") {
            await SpotifyClient.searchTracks(name).then(
            data => {
                if (data.body.tracks.items.length <= 0)
                {
                    artURL = null;

                    return;
                }

                // spotify only has art for albums, so just grab the album art
                // also grab the mid-sized album for better chart fit
                artURL = data.body.tracks.items[0].album.images[1].url;
            },
            err => {
                // if authentication failed, retry the grab with new credentials
                if (err.statusCode === 401) {
                    SpotifyAuthClient();

                    return this._grabSpotifyArt(type, name);
                }
            });
        }

        return artURL;
    }
}

module.exports = LastFM;