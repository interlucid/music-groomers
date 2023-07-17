import express from 'express';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { Builder, By, Key, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js'

const app = express()
const port = 3000

app.set('view engine', 'ejs')

app.get('/', (req, res) => {
    res.render('index');
})

app.get('/amazon-music', (req, res) => {
    res.render('amazon-music');
})

const getTitle = (dom) => {
    let title = 'defaultTitle';
    // console.log(dom.serialize());
    // console.log(dom.window.document)
    // const titleElement = dom.window.document.querySelector('title')
    // console.log(titleElement);
    // title = dom.serialize();
    title = dom.window.document.title;
    // if(titleElement) {
    //     title = titleElement.textContent;
    // }
    console.log(`@@@@@@@@@@@@@@@@@@@@@@@@@@ TITLE IS @@@@@@@@@@@@@@@@@@@@@@@@@@@@@ ${title}`);
    return title;
}

app.get('/amazon-metadata/:asin', async (req, res) => {

    

    // try getting from Amazon.com if we don't have a cache

    console.log('about to start builder')
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
    try {
        await driver.get(`https://amazon.com/dp/${req.params.asin}`);
        await setTimeout(async () => {
            const title = await driver.getTitle();
            console.log(title);
            const titleArray = title.split(` by `);
            console.log(titleArray);
            const artist = titleArray[1].split(` - `)[0];
            const album = titleArray[0];
            await driver.quit();
            res.send(JSON.stringify({
                artist,
                album,
                asin: req.params.asin,
            }))
        }, 1000)
    } catch(e) {
        res.send(JSON.stringify({
            error: `failed to load the page`,
            asin: req.params.asin,
        }))
    }
    finally {
        // await driver.quit();
    }

})

app.listen(port, () => {
    console.log(`Music groomer listening on port ${port}`)
})