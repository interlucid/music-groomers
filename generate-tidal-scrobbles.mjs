import { promises as fs } from 'fs';
import { setTimeout } from 'timers/promises';
import { Builder, By, Key, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js'
import { MongoClient }  from 'mongodb';
import { Queue, Worker } from 'bullmq';

const dbUrl = `mongodb://localhost:27019/`;
const dbClient = new MongoClient(dbUrl);
const dbName = 'tidal';
let db = null;
let albumDataCollection = null;

const prettyPrint = (data) => {
    console.log(JSON.stringify(data, null, 4));
}

const groomTidalDownload = async () => {
    try {
        // console.log(dbClient);
		await dbClient.connect();
		console.log('Successfully connected to database');
	} catch (e) {
		console.error('Error connecting to database')
        throw e;
	}
    db = dbClient.db(dbName);
    albumDataCollection = db.collection('albumData');

    // import the file
    const fileText = await fs.readFile(`tidal-streams.json`, {encoding: 'utf8'})

    // const textLineArray = fileText.split('\n')
    // console.log(textLineArray)
    // const streamDataArrayArray = textLineArray
    //     .slice(1)
    //     .filter(textLine => {
    //         // try {
    //         //     JSON.parse(textLine);
    //         // } catch (e) {
    //         //     return false;
    //         // }
    //         return true;
    //     })
    //     .map(textLine => {
    //         // console.log(textLine);
    //         const tempTextArray = textLine.split(',');
    //         const textArray = [
    //             ...tempTextArray.slice(0, 1), // time
    //             tempTextArray.slice(1, tempTextArray.length - 1).join(','), // title which might have commas
    //             ...tempTextArray.slice(tempTextArray.length - 1), // URL
    //         ]
    //         console.log(textArray);
    //         return textArray;
    //         // return JSON.parse(textLine)
    //     })
    // // console.log(streamDataArrayArray);
    // const streamDataKeys = textLineArray.slice(0, 1)[0].split(',');
    // console.log(streamDataKeys)
    const streamDataObjectArray = JSON.parse(fileText);
        // .map(streamDataArray => {
        //     // console.log(streamDataArray)
        //     let streamDataObject = {};
        //     for(let i = 0; i < streamDataKeys.length; i++) {
        //         streamDataObject[streamDataKeys[i]] = streamDataArray[i];
        //     }
        //     // console.log(streamDataObject);
        //     return streamDataObject;
        // })
    // prettyPrint(streamDataObjectArray)

    // filter out streams that are less than half the length of the song
    const scrobbleDataObjectArray = streamDataObjectArray
        // .filter(streamDataObject => {
        //     return (streamDataObject.trackLengthMs / 2) - streamDataObject.consumptionDurationMs < 0;
        // })
    // prettyPrint(scrobbleDataObjectArray)
    console.log(`fetching cached or fetched data for up to ${scrobbleDataObjectArray.length} tracks...`)

    // fetchURLData(scrobbleDataObjectArray[0]);

    let enhancedScrobbleDataObjectArray = [];

    // set up queue

    const tidalQueue = new Queue('tidalQueue', { connection: {
        host: 'localhost',
        port: 6379
      }});
    
    // add  objects to the queue
    async function addJobs() {
        for(let i = 0; i < Math.min(10000, scrobbleDataObjectArray.length); i++) {
            await tidalQueue.add(scrobbleDataObjectArray[i].track_title, { ...scrobbleDataObjectArray[i], arrayIndex: i, });
        }
    }
    
    await addJobs();

    console.log(`added jobs`)

    const msToHumanReadableTime = (ms) => {
        const seconds = ms / 1000;
        const leftoverSeconds = seconds % 60;
        const minutes = parseInt(seconds / 60);

        const humanReadableTime = `${minutes}:${leftoverSeconds.toLocaleString('en-US', {
            minimumIntegerDigits: 2,
            useGrouping: false
          })}`;

        console.log(humanReadableTime);
        return humanReadableTime;
    }

    const worker = new Worker('tidalQueue', async job => {
        if(job.data.title === "") return;
        console.log(`processing job ${job.data.arrayIndex} of ${scrobbleDataObjectArray.length}`)
        // console.log(job.data);
        const enhancedScrobbleDataObject = {
            ...job.data,
            // make a request using the track title
            ...await fetchURLData(job.data),
            // convert some things for the scrubbler parser
            // humanReadableTime: msToHumanReadableTime(job.data.trackLengthMs),
            // consumptionDurationMs: parseInt(job.data.consumptionDurationMs),
        }
        enhancedScrobbleDataObjectArray.push(enhancedScrobbleDataObject)
    });

    worker.on('drained', async () => {
        console.log(`job queue has completed!`);
        // prettyPrint(enhancedScrobbleDataObjectArray)
        await dbClient.close();
        try {
            await fs.writeFile(`tidal-scrobbles-start-to-2022-10-21.json`, JSON.stringify(enhancedScrobbleDataObjectArray));
        } catch (error) {
            console.error(error)
        }
    });
    
    
}


const fetchURLData = async (scrobbleDatum) => {
    if(!scrobbleDatum.track_title || scrobbleDatum.track_title.trim() === '') return null;

    console.log(`getting cached or fetched URL data for "${scrobbleDatum.track_title}" by ${scrobbleDatum.artist_name}`)

    // const trackUrlArray = scrobbleDatum.track_url.split('/')
    // console.log(trackUrlArray);
    // const username = trackUrlArray[3];

    // try the cache first
    const cachedSongDatum = await albumDataCollection.findOne({
        track_title: scrobbleDatum.track_title,
    })

    console.log(`cached datum is ${JSON.stringify(cachedSongDatum)}`);

    if(cachedSongDatum) return cachedSongDatum;


    // return;

    // try Spotify if that doesn't work

    // add a delay so Spotify doesn't block us, will work if awaited in a queue
    // const time = 2000 + Math.random() * 3000;
    const time = 5000 + Math.random() * 15000;
    console.log(`starting Spotify scrape after ${(time/1000).toFixed(1)} seconds...`)

    await setTimeout(time, 'result')

    console.log(`starting Spotify scrape now`)

    // console.log('about to start builder')
    let driver = await new Builder()
        .forBrowser('firefox')
        // .forBrowser('chrome')
        // .setChromeOptions(chromeOptions)
        .setFirefoxOptions(new firefox
            .Options()
            .headless()
            // .windowSize(screen)
        )
        .build();
    // console.log(`finished builder, about to make request`)

    const upsertNotFound = async () => {
        const notFoundArtistDatum = {
            album: `NOT FOUND`,
            track_title: scrobbleDatum.track_title,
        }
        await albumDataCollection
            .updateOne({
                username
            }, {
                $set: {
                    ...notFoundArtistDatum
                }
            }, {
                upsert: true
            })
        return notFoundArtistDatum;
    }

    try {
        const searchUrl = `https://open.spotify.com/search/${encodeURIComponent(scrobbleDatum.artist_name)}%20${encodeURIComponent(scrobbleDatum.track_title)}/tracks`;
        console.log(`searchUrl is ${searchUrl}`)
        await driver.get(searchUrl);
        await setTimeout(5000, 'delay');
        // console.log(`after setTimeout`)
        // const songPageTitle = await driver.getTitle();
        const songAlbumName = await driver.findElement(By.css('[data-testid=tracklist-row] [aria-colindex="3"] .standalone-ellipsis-one-line')).getText();
        // console.log(songAlbumName);

        await driver.quit();

        // const songPageTitleArray = songPageTitle.split(`Stream `);
        
        // console.log(songPageTitleArray);
        // const songPageArtist = songPageTitleArray[1].split(` music | Listen to songs, albums, playlists for free on Tidal`)[0].trim();
        // // const album = songPageTitleArray[0].trim();
        
        const fetchedAlbumPageDatum = {
            album: songAlbumName,
            artist_name: scrobbleDatum.artist_name,
            track_title: scrobbleDatum.track_title,
        }

        console.log(`storing and returning artist and album for "${scrobbleDatum.track_title}"`)
        prettyPrint(fetchedAlbumPageDatum);

        // add the datum to the database
        await albumDataCollection
            .updateOne({
                track_title: scrobbleDatum.track_title
            }, {
                $set: {
                    ...fetchedAlbumPageDatum
                }
            }, {
                upsert: true
            })
        console.log(`finished caching data in database`)

        return fetchedAlbumPageDatum;

    } catch(e) {
        console.error(e);
    }
}

groomTidalDownload();
