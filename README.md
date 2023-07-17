# Last.fm Music Groomers

These scripts take download files from music services like Amazon Music, Tidal, and SoundCloud, find missing data by scraping webpages, cache it in a database, and produce a file with streams that you can import into Last.fm.

## Requirements

- Node/NPM
- Docker

Note: this software will scrape data from music services. This probably violates ToS. There are extreme rate limits built into this software (one request every 5-20 seconds) to avoid it looking like data is being scraped. However I assume zero liability for any repercussions or legal issues that result from you using this software.

## Setup

1. `docker compose up -D`
1. `npm i`
1. Download and rename the file corresponding to your music service (note: you may want to use a text editor to remove some of the streams from your download if you have been tracking streams from that service with Last.fm before the download was requested; otherwise you will have duplicate scrobbles in Last.fm):
    - amazon-streams.csv
    - soundcloud-streams.csv
    - tidal-streams.json
1. Run the script corresponding to your music service:
    - node generate-amazon-scrobbles.mjs
    - node generate-soundcloud-scrobbles.mjs
    - node generate-tidal-scrobbles.mjs
1. Wait for the script to complete (may take several minutes or even a couple hours because of rate limiting)
1. Look for the resulting file that is saved:
    - amazon-scrobbles.json
    - soundcloud-scrobbles.json
    - tidal-scrobbles.json

## How it works

These aren't steps to follow, this is just what is going on behind the scenes:

1. The Docker command uses the `docker-compose.yml` to host a Mongo database and a Redis database in Docker.
    - The Mongo database is for storing the cache of artist and album data we already found when scraping so we don't have to scrape the same page multiple times
    - The Redis database is for hosting the a queue. Each stream from the download file is parsed and a job is created to either fetch the data from the Mongo cache or scrape the music service page if there is a cache miss.
1. The JS scripts will each do the following:
    1. Parse the input file to an in-memory JS object
    1. Create a BullMQ job for each stream in the object
    1. Add the job to the queue
    1. Run the queue
    1. Save the results in a file
1. Each job in the queue will do the following:
    1. Make a request to the Mongo database for the data
    1. If the data is found, add an entry to a final data in-memory object
    1. If the data is not found, use Selenium and the Chrome webdriver to load a relevant webpage from the music service (either the song page using an ID or a search results page using the song name and artist name) and target the missing data which it will add to the final data object and save in the database for the future

## Other

There are some old ideas in the `old` folder. Don't worry about them unless you want to try to make this work in a browser or something. Be warned they are very unsupported.
