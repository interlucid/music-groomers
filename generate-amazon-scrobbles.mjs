import { promises as fs } from 'fs';
import { setTimeout } from 'timers/promises';
import { Builder, By, Key, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js'
import { MongoClient }  from 'mongodb';
import { Queue, Worker } from 'bullmq';

const dbUrl = `mongodb://localhost:27019/`;
const dbClient = new MongoClient(dbUrl);
const dbName = 'amazonMusic';
let db = null;
let songDataCollection = null;

const prettyPrint = (data) => {
    console.log(JSON.stringify(data, null, 4));
}

const groomAmazonMusicDownload = async () => {
    try {
        // console.log(dbClient);
		await dbClient.connect();
		console.log('Successfully connected to database');
	} catch (e) {
		console.error('Error connecting to database')
        throw e;
	}
    db = dbClient.db(dbName);
    songDataCollection = db.collection('songData');

    // import the file
    const fileText = await fs.readFile(`amazon-streams.csv`, {encoding: 'utf8'})

    const textLineArray = fileText.split('\r\n')
    const streamDataArrayArray = textLineArray
        .slice(1)
        .filter(textLine => {
            // try {
            //     JSON.parse(textLine);
            // } catch (e) {
            //     return false;
            // }
            return true;
        })
        .map(textLine => {
            // console.log(textLine);
            const textArray = textLine.split(',');
            // console.log(textArray);
            return textArray;
            // return JSON.parse(textLine)
        })
    // console.log(streamDataArrayArray);
    const streamDataKeys = textLineArray.slice(0, 1)[0].split(',');
    // console.log(streamDataKeys)
    const streamDataObjectArray = streamDataArrayArray
        .map(streamDataArray => {
            // console.log(streamDataArray)
            let streamDataObject = {};
            for(let i = 0; i < streamDataKeys.length; i++) {
                streamDataObject[streamDataKeys[i]] = streamDataArray[i];
            }
            // console.log(streamDataObject);
            return streamDataObject;
        })
    // prettyPrint(streamDataObjectArray)

    // filter out streams that are less than half the length of the song
    const scrobbleDataObjectArray = streamDataObjectArray
    .filter(streamDataObject => {
        return (streamDataObject.trackLengthMs / 2) - streamDataObject.consumptionDurationMs < 0;
    })
    // prettyPrint(scrobbleDataObjectArray)

    // fetchASINData(scrobbleDataObjectArray[0].asin);

    let enhancedScrobbleDataObjectArray = [];

    // set up queue

    const amazonMusicQueue = new Queue('amazonMusicQueue', { connection: {
        host: 'localhost',
        port: 6379
      }});
    
    // add  objects to the queue
    async function addJobs() {
        for(let i = 0; i < Math.min(5000, scrobbleDataObjectArray.length); i++) {
            await amazonMusicQueue.add(scrobbleDataObjectArray[i].asin, scrobbleDataObjectArray[i]);
        }
        // await amazonMusicQueue.add('myJobName', { foo: 'bar' });
        // await amazonMusicQueue.add('myJobName', { qux: 'baz' });
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

    const worker = new Worker('amazonMusicQueue', async job => {
        if(job.data.title === "") return;
        // console.log(job.data);
        const enhancedScrobbleDataObject = {
            ...job.data,
            // make a request using the track ASIN
            ...await fetchASINData(job.data),
            // convert some things for the scrubbler parser
            humanReadableTime: msToHumanReadableTime(job.data.trackLengthMs),
            consumptionDurationMs: parseInt(job.data.consumptionDurationMs),
        }
        enhancedScrobbleDataObjectArray.push(enhancedScrobbleDataObject)
    }, () => {

    });

    worker.on('drained', async () => {
        console.log(`job queue has completed!`);
        // prettyPrint(enhancedScrobbleDataObjectArray)
        await dbClient.close();
        try {
            await fs.writeFile(`amazon-scrobbles.json`, JSON.stringify(enhancedScrobbleDataObjectArray));
        } catch (error) {
            console.error(error)
        }
    });
    
    
}


const fetchASINData = async (scrobbleDatum) => {
    const asin = scrobbleDatum.asin;
    if(!asin && (!scrobbleDatum.title || scrobbleDatum.title.trim() === '')) return null;
    console.log(`getting cached or fetched ASIN data for "${scrobbleDatum.title}"`)

    // try the cache first
    const cachedSongDatum = await songDataCollection.findOne({
        asin
    })

    console.log(`cached datum is ${JSON.stringify(cachedSongDatum)}`);

    if(cachedSongDatum) return cachedSongDatum;


    // return;

    // try Amazon if that doesn't work

    // add a delay so Amazon doesn't block us, will work if awaited in a queue
    const time = 5000 + Math.random() * 15000;
    console.log(`starting Amazon scrape after ${(time/1000).toFixed(1)} seconds...`)

    await setTimeout(time, 'result')

    // console.log(`returning early after ${(time/1000).toFixed(1)} seconds`)
    // return;

    console.log(`starting Amazon scrape now`)

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
        const notFoundSongDatum = {
            artist: `NOT FOUND`,
            album: `NOT FOUND`,
            asin,
        }
        await songDataCollection
            .updateOne({
                asin
            }, {
                $set: {
                    ...notFoundSongDatum
                }
            }, {
                upsert: true
            })
        return notFoundSongDatum;
    }

    try {
        await driver.get(`https://amazon.com/dp/${asin}`);
        await setTimeout(3000, 'delay');
        // console.log(`after setTimeout`)
        const songPageTitle = await driver.getTitle();
        console.log(songPageTitle);
        const amazonNotFoundTitle = `Amazon Music Unlimited | Stream 100 Million Songs & Podcasts`;
        if(songPageTitle.includes(amazonNotFoundTitle)) {
            // if we didn't find the track and there's no artist, give up
            if(!scrobbleDatum.artistAsin) {
                // prettyPrint(scrobbleDatum);
                console.log(`artistAsin is falsy so we're returning early with unknown artist`)
                return await upsertNotFound();
            }
            
            // if we didn't find the track but there's an artist ASIN let's try that
            console.log(`Amazon track scrape failed, starting Amazon artist scrape after ${(time/1000).toFixed(1)} seconds...`)
            await setTimeout(time, 'result')
            await driver.get(`https://amazon.com/dp/${scrobbleDatum.artistAsin}`);
            await setTimeout(3000, 'delay');
            const artistPageTitle = await driver.getTitle();
            await driver.quit();

            if(artistPageTitle.includes(amazonNotFoundTitle)) {
                console.log(`couldn't find the artist either, returning with unknown artist`)
                return await upsertNotFound();
            }

            const artistPageTitleArray = artistPageTitle.split(`on Amazon Music`)
            const artistPageArtist = artistPageTitleArray[0];

            const fetchedArtistPageDatum = {
                artist: artistPageArtist,
                album: `NOT FOUND`,
                asin,
            }
            console.log(`storing and returning artist data only for ${scrobbleDatum.title}`)
            prettyPrint(fetchedArtistPageDatum);
            await songDataCollection
                .updateOne({
                    asin
                }, {
                    $set: {
                        ...fetchedArtistPageDatum
                    }
                }, {
                    upsert: true
                })
            return fetchedArtistPageDatum;

        }
        await driver.quit();

        const songPageTitleArray = songPageTitle.split(` by `).length === 2 ? songPageTitle.split(` by `) : songPageTitle.split(':').slice(1, 3);
        
        console.log(songPageTitle);
        console.log(songPageTitleArray);
        const songPageArtist = songPageTitleArray[1].split(` on Amazon Music - Amazon.com`)[0].trim();
        const album = songPageTitleArray[0].trim();
        
        const fetchedSongPageDatum = {
            artist: songPageArtist,
            album,
            asin,
        }
        console.log(`storing and returning artist and album for ${scrobbleDatum.title}`)
        prettyPrint(fetchedSongPageDatum);
        // add the datum to the database
        await songDataCollection
            .updateOne({
                asin
            }, {
                $set: {
                    ...fetchedSongPageDatum
                }
            }, {
                upsert: true
            })
        console.log(`finished caching data in database`)

        return fetchedSongPageDatum;

    } catch(e) {
    
    }
}

groomAmazonMusicDownload();
