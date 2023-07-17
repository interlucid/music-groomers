    // const chromeOptions = new chrome.Options()
    //     .setChromeBinaryPath(chromeBinaryPath)
    //     .addArguments('--no-sandbox');

// const response = await fetch(`https://amazon.com/dp/${req.params.asin}`);
    // const text = await response.text();

    // try {
    //     await JSDOM.fromURL(`https://amazon.com/dp/${req.params.asin}`, { runScripts: "dangerously", resources: "usable" })
    //     // await JSDOM.fromURL(`http://localhost:3000/amazon-music`, { runScripts: "dangerously", resources: "usable" })
    //         .then(async dom => {
    //             try {
    //                 let title;
    //                 console.log(dom.window.document.title)
    //                 if (dom.window.document.readyState !== 'loading') {
    //                     // console.log(dom)
    //                     await setInterval(() => {
    //                         title = getTitle(dom);
    //                         if(!title) return;
    //                         res.send(JSON.stringify({
    //                             artist: title,
    //                             album: title,
    //                             asin: req.params.asin,
    //                         }))
    //                     }, 1000);
    //                 } else {
    //                     dom.window.document.addEventListener('DOMContentLoaded', async () => {
    //                         await setInterval(() => {
    //                             title = getTitle(dom);
    //                             if(!title) return;
    //                             res.send(JSON.stringify({
    //                                 artist: title,
    //                                 album: title,
    //                                 asin: req.params.asin,
    //                             }))
    //                         }, 1000);
    //                     });
                        
    //                 }
    //                 // res.send(JSON.stringify({
    //                 //     error: `shouldn't reach this point`,
    //                 //     asin: req.params.asin,
    //                 // }))
    //             } catch(e) {
    //                 console.error(e)
    //                 res.send(JSON.stringify({
    //                     error: 'Initial response okay but encountered an error waiting for DOMContentLoaded',
    //                     asin: req.params.asin,
    //                 }))
    //             }
    //             // console.log(dom)
    //             // await setTimeout(() => {
    //             // }, 3000);

    //         });
    // } catch(e) {
    //     console.error(e)
    //     res.send(JSON.stringify({
    //         error: 'Initial response was not a 200',
    //         asin: req.params.asin,
    //     }))
    // }
    // console.log(dom);