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

    static async getUserAvatarUrl(username) {
        lastFMAPIOptions.qs.method  = 'user.getinfo';
        lastFMAPIOptions.qs.api_key = process.env.LAST_FM_API_KEY;
        lastFMAPIOptions.qs.user    = username;
        lastFMAPIOptions.qs.format  = 'json';

        try {
            const result = await request(lastFMAPIOptions);

            lastFMAPIOptions.qs = {};

            return result.user.image[result.user.image.length - 1]['#text'];
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
                image:  first.image[first.image.length - 1]['#text'],
                url:    first.url
            }
        }
        catch (e) {
            console.log(e);

            lastFMAPIOptions.qs = {};

            return undefined;
        }
    }

    static async getUserTopAlbums(username, period, count, page, albumArray) {
        lastFMAPIOptions.qs.method  = 'user.gettopalbums';
        lastFMAPIOptions.qs.api_key = process.env.LAST_FM_API_KEY;
        lastFMAPIOptions.qs.user    = username;
        lastFMAPIOptions.qs.period  = period;
        lastFMAPIOptions.qs.page  = page;
        lastFMAPIOptions.qs.format  = 'json';

        if (albumArray === undefined) {
            albumArray = [];
        }

        if (page === undefined) {
            page = 1;
        }

        try {
            const result = await request(lastFMAPIOptions);
            lastFMAPIOptions.qs = {};

            if (albumArray.length + result.topalbums.album.length <= count) {
                albumArray = albumArray.concat(result.topalbums.album);
            }
            else {
                const albumsNeeded = count - albumArray.length;
                albumArray = albumArray.concat(result.topalbums.album.slice(0, albumsNeeded));
            }

            // If we need to query extra pages for data, do that
            if (page < result.topalbums['@attr'].totalPages && albumArray.length < count) {
                return await this.getUserTopAlbums(username, period, count, page + 1, albumArray);
            }
        }
        catch (e) {
            console.log(e);

            lastFMAPIOptions.qs = {};

            return undefined;
        }

        if (albumArray.length <= 0) {
            return undefined;
        }

        let albums         = [];
        let totalPlayCount = 0;

        for (let i = 0; i < albumArray.length; i++) {
            const album = albumArray[i];

            let albumArt = await Spotify.getArtForType(
                "album",
                `${album.name} artist:${album.artist.name}`
            );

            if (albumArt === null || albumArt === undefined) {
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

    static async getUserTopArtists(username, period, count, page, artistArray) {
        lastFMAPIOptions.qs.method  = 'user.gettopartists';
        lastFMAPIOptions.qs.api_key = process.env.LAST_FM_API_KEY;
        lastFMAPIOptions.qs.user    = username;
        lastFMAPIOptions.qs.period  = period;
        lastFMAPIOptions.qs.page    = page;
        lastFMAPIOptions.qs.format  = 'json';

        if (artistArray === undefined) {
            artistArray = [];
        }

        if (page === undefined) {
            page = 1;
        }

        try {
            const result = await request(lastFMAPIOptions);
            lastFMAPIOptions.qs = {};

            if (artistArray.length + result.topartists.artist.length <= count) {
                artistArray = artistArray.concat(result.topartists.artist);
            }
            else {
                const artistsNeeded = count - artistArray.length;
                artistArray = artistArray.concat(result.topartists.artist.slice(0, artistsNeeded));
            }

            // If we need to query extra pages for data, do that
            if (page < result.topartists['@attr'].totalPages && artistArray.length < count) {
                return await this.getUserTopArtists(username, period, count, page + 1, artistArray);
            }
        }
        catch (e) {
            console.log(e);

            lastFMAPIOptions.qs = {};

            return undefined;
        }

        if (artistArray.length <= 0) {
            return undefined;
        }

        let artists        = [];
        let totalPlayCount = 0;

        for (let i = 0; i < artistArray.length; i++) {
            const artist = artistArray[i];

            totalPlayCount += parseInt(artist.playcount);

            let artistArt = await Spotify.getArtForType(
                "artist",
                artist.name
            );

            if (artistArt === null || artistArt === undefined) {
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

    static async getUserTopTracks(username, period, count, page, trackArray) {
        lastFMAPIOptions.qs.method  = 'user.gettoptracks';
        lastFMAPIOptions.qs.api_key = process.env.LAST_FM_API_KEY;
        lastFMAPIOptions.qs.user    = username;
        lastFMAPIOptions.qs.period  = period;
        lastFMAPIOptions.qs.page  = page;
        lastFMAPIOptions.qs.format  = 'json';

        if (trackArray === undefined) {
            trackArray = [];
        }

        if (page === undefined) {
            page = 1;
        }

        try {
            const result = await request(lastFMAPIOptions);
            lastFMAPIOptions.qs = {};

            if (trackArray.length + result.toptracks.track.length <= count) {
                trackArray = trackArray.concat(result.toptracks.track);
            }
            else {
                const tracksNeeded = count - trackArray.length;
                trackArray = trackArray.concat(result.toptracks.track.slice(0, tracksNeeded));
            }

            // If we need to query extra pages for data, do that
            if (page < result.toptracks['@attr'].totalPages && trackArray.length < count) {
                return await this.getUserTopTracks(username, period, count, page + 1, trackArray);
            }
        }
        catch (e) {
            console.log(e);

            lastFMAPIOptions.qs = {};

            return undefined;
        }

        if (trackArray.length <= 0) {
            return undefined;
        }

        let tracks         = [];
        let totalPlayCount = 0;

        for (let i = 0; i < trackArray.length; i++) {
            const track = trackArray[i];

            let art = await Spotify.getArtForType(
                "track",
                `${track.name} artist:${track.artist.name}`
            );

            // try and fall back to artist art if track art cannot be found
            if (art === null || art === undefined) {
                art = await Spotify.getArtForType(
                    "artist",
                    track.artist.name
                );
            }

            if (art === null || art === undefined) {
                art = await this.getTrackArt(track.name, track.artist.name);

                if (art === undefined) {
                    art = track.image[track.image.length - 1]["#text"];
                }
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
}

class Spotify {
    static async getTrackLink(query) {
        if (SpotifyClient === undefined) {
            return null;
        }

        let trackURL = "";

        await SpotifyClient.searchTracks(query).then(data => {
            trackURL = data.body.tracks.items[0].external_urls.spotify;
        }, err => {
            // if authentication failed, retry the grab with new credentials
            if (err.statusCode === 401) {
                SpotifyAuthClient();

                trackURL = this.getTrackLink(type, name);
            }
        });

        return trackURL;
    }

    static async getArtForType(type, name) {
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
                
                // try a different source if the artist doesn't have images
                if (data.body.artists.items[0].images.length <= 0)
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

                    artURL = this.getArtForType(type, name);
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

                // try a different source if the album doesn't have images
                if (data.body.albums.items[0].images.length <= 0)
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

                    artURL = this.getArtForType(type, name);
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

                // try a different source if the track doesn't have images
                if (data.body.tracks.items[0].album.images.length <= 0)
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

                    artURL = this.getArtForType(type, name);
                }
            });
        }

        return artURL;
    }
}

module.exports = { LastFM, Spotify };
