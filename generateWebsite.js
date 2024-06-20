const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const markup = require('./markup.js')
const puppeteer = require('puppeteer')
const http = require('http')
const express = require('express')

const livePreviewInjection = `
<script>
${fs.readFileSync('./livePreviewInjection.js', 'utf-8')}
</script>
`

// function wrapFunction(func, prefunc) {
//     return (...args) => {
//         prefunc(...args)
//         func(...args)
//     }
// }

// fs.writeFileSync = wrapFunction(fs.writeFileSync, (to) => console.log('write', to))
// fs.copyFileSync = wrapFunction(fs.copyFileSync, (...args) => console.log('copy', ...args))

const ignoredPaths = (() => {
    let dontScan = []
    let dontCount = []
    let dontPath = []
    let paths = fs.readFileSync('./ignoredPaths.txt', 'utf8').split('\r\n')
    paths.forEach(path => {
        if (path.slice(0, 2) == '//') return
        const prefix = path.slice(0, 1)
        const line = path.slice(2)
        if (prefix == '0') {
            dontScan.push(line)
            dontCount.push(line)
            dontPath.push(line)
        } else if (prefix == '1') {
            dontCount.push(line)
        } else if (prefix == '2') {
            dontScan.push(line)
        } else if (prefix == '3') {
            dontScan.push(line)
            dontCount.push(line)
        }
    })
    return { scan: dontScan, count: dontCount, path: dontPath }
})()

function smartCopyFile(from, to) {
    const exists = fs.existsSync(to)
    if (!exists || fs.statSync(from).mtime.getTime() !== fs.statSync(to).mtime.getTime()) {
        if (!exists)
            fs.mkdirSync(path.dirname(to), { recursive: true, force: true })
        fs.copyFileSync(from, to)
    }
}

function smartMakeDir(path) {
    if (!fs.existsSync(path))
        fs.mkdirSync(path)
}

function smartCopyDir(from, to) {
    for (const file of fs.readdirSync(from))
        if (fs.statSync(`${from}/${file}`).isDirectory())
            smartCopyDir(`${from}/${file}`, `${to}/${file}`)
        else
            smartCopyFile(`${from}/${file}`, `${to}/${file}`)
}

function smartRemoveExtra(path, allowed) {
    for (const file of fs.readdirSync(path))
        if (!allowed.includes(file)) {
            console.log(path, allowed, file, `${path}/${file}`)
            fs.rmSync(`${path}/${file}`, { recursive: true, force: true })
        }
}

function setupFolder() {
    process.chdir('C:\\Users\\jack\\Home\\Programming\\blog projects\\blog generator')
    if (!fs.existsSync('./output')) fs.mkdirSync('./output')
    smartRemoveExtra('./output', ['.git', 'backgrounds', 'posts', 'backgroundManager.js', 'firaCode.ttf', 'index.html', 'mem.json', 'postStyles.css', 'siteStyles.css', 'updateStats.js', 'preview.png'])
    smartCopyFile('./blankSite.html', './output/index.html')
    smartCopyFile('./siteStyles.css', './output/siteStyles.css')
    smartCopyFile('./postStyles.css', './output/postStyles.css')
    smartCopyFile('./updateHomeStats.js', './output/updateStats.js')
    smartCopyFile('./firaCode.ttf', './output/firaCode.ttf')
    smartMakeDir('./output/backgrounds')
    smartMakeDir('./output/posts')
}

function findPostPaths() {
    const postPaths = []
    fs.readdirSync('../').forEach(projectDiv => {
        if (fs.lstatSync(`../${projectDiv}`).isDirectory())
            fs.readdirSync(`../${projectDiv}`).forEach(projectItem => {
                if (fs.lstatSync(`../${projectDiv}/${projectItem}`).isDirectory() && projectItem.split('blogPost_')[0] == '')
                    postPaths.push(`../${projectDiv}/${projectItem}`)
            })
    })
    return postPaths
}

function cleanPostsFolder(postPaths) {
    postPaths = postPaths.map(post => post.split('blogPost_')[1])
    for (const file of fs.readdirSync('./output/posts'))
        if (!postPaths.includes(file))
            fs.rmSync(`./output/posts/${file}`, { recursive: true, force: true })
}

function setupLiveBackgrounds(postPaths) {
    const backgroundPaths = []

    postPaths.forEach(async postPath => {
        if (fs.existsSync(`${postPath}/background.js`)) {
            fs.readFileSync(`${postPath}/background.js`, 'utf8').split('\r\n').forEach(line => {
                if (line.slice(0, 26) == '//includeInHomeBackgrounds')
                    backgroundPaths.push(`./posts/${postPath.split('blogPost_')[1]}/background.js`)
            })
        }
    })

    backgroundPaths.push(...fs.readdirSync('./mainPageBackgrounds').map(path => `./backgrounds/${path}`))

    smartRemoveExtra('./output/backgrounds', backgroundPaths.map(path => path.slice(14)))

    smartCopyDir('./mainPageBackgrounds', './output/backgrounds')
    fs.writeFileSync('./output/backgroundManager.js', `const backgroundPaths = ${JSON.stringify(backgroundPaths)};\r\n${fs.readFileSync('./siteBackgroundManager.js', 'utf8')}`, 'utf8')
}

function hashFileContents(filePath) {
    const fileBuffer = fs.readFileSync(filePath)
    const hashSum = crypto.createHash('md5')
    hashSum.update(fileBuffer)
    return hashSum.digest('hex')
}

function getFolderHash(startPath) {
    let combinedHash = crypto.createHash('md5')

    function recurseDir(currentPath) {
        const items = fs.readdirSync(currentPath)
        items.forEach(item => {
            const fullPath = path.join(currentPath, item)
            const stat = fs.statSync(fullPath)
            if (stat.isDirectory() && !ignoredPaths.scan.includes(fullPath)) {
                recurseDir(fullPath)
            } else if (stat.isFile() && !ignoredPaths.scan.includes(fullPath) && item !== 'preview.png') {
                const fileHash = hashFileContents(fullPath)
                combinedHash.update(fileHash)
            }
        })
    }

    recurseDir(startPath)
    return combinedHash.digest('hex')
}

function countLinesOfCode(directory = './', lineCount = 0) {
    const files = fs.readdirSync(directory)

    let total = 0

    files.forEach(file => {
        const fullPath = path.join(directory, file)
        const stats = fs.statSync(fullPath)

        if (stats.isDirectory() && !ignoredPaths.count.includes(fullPath)) {
            total += countLinesOfCode(fullPath)
        } else if (stats.isFile() && !ignoredPaths.count.includes(fullPath))
            total += fs.readFileSync(fullPath, 'utf8').split('\r\n').length
    })
    return total
}

function getUniqueLinesOfCode() {
    let codeLines = []

    function readFile(path) {
        let fileContent = fs.readFileSync(path, 'utf8').split('\r\n')

        fileContent.forEach(item => {
            while (item.split('  ').length > 1)
                item = item.split('  ').join(' ')
            item = item.trim()
            if (!codeLines.includes(item))
                codeLines.push(item)
        })
    }

    function scanDirectory(directory) {
        const files = fs.readdirSync(directory)

        files.forEach(file => {
            const fullPath = path.join(directory, file)
            const stats = fs.statSync(fullPath)

            if (stats.isDirectory() && !ignoredPaths.scan.includes(fullPath)) {
                scanDirectory(fullPath)
            } else if (stats.isFile() && !ignoredPaths.scan.includes(fullPath))
                readFile(fullPath)
        })
    }

    scanDirectory('./')

    codeLines = codeLines.sort(() => Math.random() * 2 - 1)

    return codeLines
}

function getOrderedLinesOfCode() {
    let codeLines = {}

    function readFile(path) {
        let fileContent = fs.readFileSync(path, 'utf8').split('\r\n')

        codeLines[path] = []

        fileContent.forEach(item => {
            codeLines[path].push(item)
        })
    }

    function scanDirectory(directory) {
        const files = fs.readdirSync(directory)

        files.forEach(file => {
            const fullPath = path.join(directory, file)
            const stats = fs.statSync(fullPath)

            if (stats.isDirectory() && !ignoredPaths.scan.includes(fullPath)) {
                scanDirectory(fullPath)
            } else if (stats.isFile() && !ignoredPaths.scan.includes(fullPath))
                readFile(fullPath)
        })
    }

    scanDirectory('./')

    return codeLines
}

function getMem() {
    return JSON.parse(fs.readFileSync('./mem.json', 'utf8'))
}

function saveMem(mem) {
    fs.writeFileSync('./mem.json', JSON.stringify(mem), 'utf8')
}

function generatePost(postPath, injectLivePreview) {
    const name = postPath.split('blogPost_')[1]

    smartMakeDir(`./output/posts/${name}`)

    fs.readdirSync(postPath).forEach(file => {
        if (!['script.txt', 'title.txt', 'preview.txt'].includes(file)) {
            if (fs.statSync(`${postPath}/${file}`).isDirectory())
                smartCopyDir(`${postPath}/${file}`, `./output/posts/${name}/${file}`, { recursive: true })
            else
                smartCopyFile(`${postPath}/${file}`, `./output/posts/${name}/${file}`)
        }
    })

    smartCopyFile('./postBackgroundManager.js', `./output/posts/${name}/backgroundManager.js`)

    let html = fs.readFileSync('./blankPost.html', 'utf8')

    html = html.split('meta title link').join(`${name} - Jack's project hub`)
    html = html.split('meta url link').join(`https://jacks-project-hub.vercel.app/posts/${name}/`)
    const text = markup.stripTags(fs.readFileSync(`${postPath}/preview.txt`, 'utf-8'))
    html = html.split('meta description link').join(text.length < 100 ? text : text.slice(0, 97) + '...')
    html = html.split('meta image link').join(`https://jacks-project-hub.vercel.app/posts/${name}/preview.png`)
    html = html.replace('<!-- title name link -->', name)
    let title = name
    if (fs.existsSync(`${postPath}/title.txt`)) title = markup.translate(fs.readFileSync(`${postPath}/title.txt`, 'utf8'))
    html = html.replace('<!-- title markup link -->', title)
    html = html.replace('// stat update script link', `const postName = '${name}'\r\n${fs.readFileSync('./updatePostStats.js', 'utf8')}`.split('\r\n').join('\r\n                    '))
    html = html.replace('<!-- post link -->', markup.translate(fs.readFileSync(`${postPath}/script.txt`, 'utf8')))


    if (injectLivePreview) html += livePreviewInjection

    fs.writeFileSync(`./output/posts/${name}/index.html`, html, 'utf8')

    function scan(to, from) {
        for (const file of fs.readdirSync(to))
            if (!fs.existsSync(`${from}/${file}`) && !['backgroundManager.js', 'index.html', 'preview.png'].includes(file))
                fs.rmSync(`${to}/${file}`, { recursive: true, force: true })
            else if (fs.statSync(`${to}/${file}`).isDirectory())
                scan(`${to}/${file}`, `${from}/${file}`)
    }
    scan(`./output/posts/${name}`, postPath)

    for (const file of ['script.txt', 'title.txt', 'preview.txt'])
        if (fs.existsSync(`./output/posts/${name}/${file}`))
            fs.rmSync(`./output/posts/${name}/${file}`, { recursive: true, force: true })
}

function generatePostCard(postPath) {
    const name = postPath.split('blogPost_')[1]
    let title = name
    if (fs.existsSync(`${postPath}/title.txt`)) title = markup.translate(fs.readFileSync(`${postPath}/title.txt`, 'utf8'), 1 / 4)
    let html = `<div class="post" onclick="window.location.href='./posts/${name}/'">`
    html += `
    <div class="title">
        ${title}
    </div>
    `

    let preview
    if (fs.existsSync(`${postPath}/preview.txt`)) preview = markup.translate(fs.readFileSync(`${postPath}/preview.txt`, 'utf8'))
    if (preview != undefined)
        html += `
        <div class="preview">
            ${preview}
        </div>
        `

    html += '</div>'

    return html
}

const changedPosts = []
let outputHashChanged = false
function saveAndCopyStats(updateLines) {
    const newHash = getFolderHash('./output')
    const mem = getMem()
    if (mem.outputHash != newHash) {
        mem.lastUpdate = Date.now()
        updated = true
        outputHashChanged = true
    }
    mem.outputHash = newHash
    if (updateLines) {
        mem.numberOfLines = countLinesOfCode()
        mem.uniqueLines = getUniqueLinesOfCode()
        mem.orderedLines = getOrderedLinesOfCode()
    }

    function getOutputPaths(currentPath = './output', out = []) {
        const items = fs.readdirSync(currentPath)
        items.forEach(item => {
            const fullPath = path.join(currentPath, item)
            const stat = fs.statSync(fullPath)
            if (stat.isDirectory() && !ignoredPaths.path.includes(fullPath)) {
                getOutputPaths(fullPath, out)
            } else if (stat.isFile() && !ignoredPaths.path.includes(fullPath))
                out.push(fullPath)
        })
        return out
    }
    mem.fileHashes = getOutputPaths().map(path => path).reduce((acc, path) => ({ ...acc, [path.replace('output', '.')]: hashFileContents(path) }), {})
    const postHashes = fs.readdirSync('./output/posts').reduce((acc, post) => ({ ...acc, [post]: getFolderHash(`./output/posts/${post}`) }), {})
    const oldPostHashes = mem.postHashes ?? {}
    const postsUpdated = mem.postsUpdated ?? {}
    fs.readdirSync('./output/posts').forEach(post => {
        if (postHashes[post] != oldPostHashes[post]) {
            postsUpdated[post] = Date.now()
            changedPosts.push(post)
        }
    })
    mem.postHashes = postHashes
    mem.postsUpdated = postsUpdated
    const postsCreated = mem.postsCreated ?? {}
    fs.readdirSync('./output/posts').forEach(post => {
        if (postsCreated[post] == undefined)
            postsCreated[post] = Date.now()
    })
    mem.postsCreated = postsCreated
    let siteMem = {}
    for (let key of ['lastScan', 'lastUpdate', 'outputHash', 'numberOfLines', 'uniqueLines', 'orderedLines', 'postsUpdated', 'postsCreated', 'postHashes']) siteMem[key] = mem[key]
    fs.writeFileSync('./output/mem.json', JSON.stringify(siteMem), 'utf8')
    saveMem(mem)
}

function generateMainPage(postPaths, injectLivePreview) {
    let html = fs.readFileSync('./output/index.html', 'utf8')

    html = html.replace('<!-- posts link -->', postPaths.map(postPath => generatePostCard(postPath)).join('\n '))

    if (injectLivePreview) html += livePreviewInjection

    fs.writeFileSync('./output/index.html', html, 'utf8')
}

async function generateLinkPreviews() {
    const postsMissingPreview = fs.readdirSync('./output/posts').filter(post => !fs.existsSync(`./output/posts/${post}/preview.png`))
    const missingMainPreview = !fs.existsSync('./output/preview.png')
    if (outputHashChanged || missingMainPreview || changedPosts.length || postsMissingPreview.length)
        return new Promise(async resolve => {
            console.log('Taking preview screenshots.')
            const app = express()
            app.use(express.static('./output'))
            const server = await new Promise((resolve, reject) => {
                const server = app.listen(8080, (error) => {
                    if (error) {
                        reject(error)
                        return
                    }
                    const interval = setInterval(() => {
                        http.get('http://localhost:8080', (res) => {
                            if (res.statusCode === 200) {
                                clearInterval(interval)
                                resolve(server)
                            }
                        }).on('error', () => { })
                    }, 100)
                })
                server.on('error', (err) => {
                    clearInterval(interval)
                    reject(err)
                })
            })
            const browser = await puppeteer.launch()
            const page = await browser.newPage()
            await page.setViewport(await page.evaluate(() => ({
                width: 2000,
                height: 1000
            })))

            if (outputHashChanged || missingMainPreview) {
                console.log('Screenshotting main page.')
                await page.goto(`http://localhost:8080/index.html`);
                (await page.target().createCDPSession()).send('Network.clearBrowserCache')
                await page.reload({ waitUntil: ['networkidle0'], bypassCache: true })
                await page.waitForSelector('#backgroundCanvas')
                await page.evaluate(() => {
                    const canvas = document.getElementById('backgroundCanvas')
                    canvas.style.transition = 'all 0s'
                    canvas.style.filter = 'blur(0px)'
                })
                await page.screenshot({ path: './output/preview.png' })
            }
            for (const post of [...changedPosts, ...postsMissingPreview].sort().reduce((acc, item) => {
                if (acc[acc.length - 1] !== item) acc.push(item)
                return acc
            }, [])) {
                console.log(`Screenshotting post: ${post}`)
                await page.goto(`http://localhost:8080//posts/${post}/index.html`);
                (await page.target().createCDPSession()).send('Network.clearBrowserCache')
                await page.reload({ waitUntil: ['networkidle0'], bypassCache: true })
                await page.screenshot({ path: `./output/posts/${post}/preview.png` })
            }

            await browser.close()

            await new Promise(resolve => {
                server.on('close', resolve)
                server.close()
            })

            console.log('Screenshots taken.')
            resolve()
        })
    else
        return Promise.resolve()
};

(async () => {
    const previewMode = process.argv.includes('previewMode')

    if (previewMode) console.log('(Preview Mode)')

    const start = Date.now()

    console.log('Generating website')


    setupFolder()

    const postPaths = findPostPaths()

    cleanPostsFolder(postPaths)

    setupLiveBackgrounds(postPaths)

    postPaths.forEach(postPath => generatePost(postPath, previewMode))

    generateMainPage(postPaths, previewMode)

    saveAndCopyStats(true)

    if (!previewMode)
        await generateLinkPreviews()

    console.log('Website generated in', Date.now() - start, 'ms')

    process.exit(0)

    // setTimeout(require('why-is-node-running'), 1000)
})()