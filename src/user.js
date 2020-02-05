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
class User {
    constructor(id, discordID, lastFMUsername) {
        this.id             = id;
        this.discordID      = discordID;
        this.lastFMUsername = lastFMUsername;
    }

    /**
     * Get a wurlitzer user by their Discord ID.
     *
     * Returns undefined if none found.
     */
    static get(db, discordID) {
        const row = db.prepare("SELECT * FROM user WHERE discord_id = ?").get(discordID);

        if (row === undefined)
            return undefined;

        return new User(row.id, row.discord_id, row.last_fm_username);
    }

    /**
     * Put a wurlitzer user into the database.
     * 
     * This command uses a REPLACE INTO so that if the user changes their last.fm
     * they can just reset their username.
     */
    static put(db, discordID, lastFMUsername) {
        const statement = db.prepare("REPLACE INTO user (discord_id, last_fm_username) VALUES (?, ?)");

        statement.run(discordID, lastFMUsername);
    }
}

module.exports = User;