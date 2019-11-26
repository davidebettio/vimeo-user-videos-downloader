const cheerio = require("cheerio");
const axios = require("axios");
const httpAdapter = require('axios/lib/adapters/http');
const { DateTime } = require('luxon');
const fs = require("fs");

const COOKIE = ''; // insert your cookie here
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.97 Safari/537.36';

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  })
}

function slugify(text) {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

function getPageLinks(url) {
  return new Promise((resolve, reject) => {
    axios({
      method: 'get',
      url: url,
      headers: {
        'Cookie': COOKIE,
        'User-Agent': USER_AGENT,
      }
    })
    .then(res => {
      const $ = cheerio.load(res.data);
      const li = $('[id^=clip_] > a');
      const links = li.map(function(i, el) {
        return 'https://vimeo.com' + $(this).attr('href');
      }).get();
      resolve(links);
    })
    .catch(err => {
      reject(err);
    });
  });
}

function getConfigObject(url) {
  return new Promise((resolve, reject) => {
    axios({
      method: 'get',
      url: url,
      headers: {
        'Cookie': COOKIE,
        'User-Agent': USER_AGENT,
      }
    })
    .then(res => {
      const lines = res.data.split('\n');
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.indexOf('window.vimeo.clip_page_config = ') > -1) {
          const filteredLine = line.replace('window.vimeo.clip_page_config = ', '').slice(0, -1);
          const config = JSON.parse(filteredLine);
          const id = config.clip.id;
          const title = config.clip.title;
          const configUrl = config.player.config_url;
          const uploadedOn = config.clip.uploaded_on;
          let filename = DateTime.fromFormat(config.clip.uploaded_on, 'yyyy-MM-dd HH:mm:ss').toFormat('yyyyMMdd');
          filename += "_" + slugify(title) + ".mp4";
          const result = { id, title, configUrl, uploadedOn, filename };
          resolve(result);
        }
      }
    })
    .catch(err => {
      reject(err);
    });
  });
}

function getVideoUrl(url) {
  return new Promise((resolve, reject) => {
    axios({
      method: 'get',
      url: url,
      headers: {
        'Cookie': COOKIE,
        'User-Agent': USER_AGENT,
      }
    })
    .then(res => {
      let hq = res.data.request.files.progressive.filter(e => e.quality === '1080p');
      if (hq.length === 0) {
        hq = res.data.request.files.progressive.filter(e => e.quality === '720p');
      }
      if (hq.length > 0) {
        resolve(hq[0].url);
      } else {
        reject('no video found');
      }
    })
    .catch(err => {
      reject(err);
    });
  });
}

function downloadFile(config) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(`downloads/${config.filename}`);
    axios.get(config.videoUrl, {
      responseType: 'stream', 
      adapter: httpAdapter,
      headers: {
        'Cookie': COOKIE,
        'User-Agent': USER_AGENT,
      }
    })
    .then((response) => {
        const stream = response.data;
        stream.on('data', (chunk /* chunk is an ArrayBuffer */) => {
          output.write(Buffer.from(chunk));
        });
        stream.on('end', () => {
          output.end();
          resolve();
        });
    });
  });
}

(async () => {
  // find links
  for (let p = 1; p < 9; p++) { // TODO: automatically find max pages
    const url = `https://vimeo.com/xxxx/videos/page:${p}/sort:date`;
    const links = await getPageLinks(url);
    totalLinks = totalLinks.concat(links);
    await sleep(1000);
  }

  // find video urls
  let videoObjects = [];
  for (let i = 0; i < totalLinks.length; i++) {
    console.log(`${i+1}/${totalLinks.length}`);
    const configObject = await getConfigObject(totalLinks[i]);
    configObject.videoUrl = await getVideoUrl(configObject.configUrl);
    videoObjects.push(configObject);
  }

  for (let i = 0; i < videoObjects.length; i++) {
    console.log(videoObjects[i].videoUrl);
  }

  // download
  for (let i = 0; i < videoObjects.length; i++) {
    await downloadFile(videoObjects[i]);
  }
})();


