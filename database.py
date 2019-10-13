import sqlite3
import argparse

schema = open("schema.sql", "r").read()

def create():
    connection = sqlite3.connect("db.sqlite3")
    cursor     = connection.cursor()

    cursor.execute(schema)

    connection.commit()

    cursor.close()
    connection.close()

def migrate():
    connection = sqlite3.connect("db.sqlite3")
    cursor     = connection.cursor()

    cursor.execute(schema)
    cursor.execute("INSERT INTO user (id, discord_id, last_fm_username) SELECT * FROM discordLastFMUser")
    cursor.execute("DROP TABLE discordLastFMUser")

    connection.commit()

    cursor.close()
    connection.close()

parser = argparse.ArgumentParser(description="Run database actions for the wurlitzer instance.")
parser.add_argument('-create', help="Create a new wurlitzer database", action='store_true')
parser.add_argument('-migrate', help="Migrate an old wurlitzer database", action='store_true')

args = parser.parse_args()

if args.create and args.migrate:
    print("You cannot create as well as migrate at the same time!")
elif args.create:
    create()
elif args.migrate:
    migrate()
else:
    print("-create or -migrate must be specified!")