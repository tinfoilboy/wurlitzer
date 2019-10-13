CREATE TABLE user (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id       TEXT UNIQUE,
    last_fm_username TEXT
);