//bun "C:\Users\jack\Home\Programming\blog projects\blog generator\livePreview.js"

const { spawn } = require('bun')
const chokidar = require('chokidar')
const { resolve, join, extname } = require('path')
const fs = require('fs')
import { serve, file as BunFile } from 'bun'
import { lookup as getMimeType } from 'mime-types'
import { WebSocketServer } from 'ws'

process.chdir('C:\\Users\\jack\\Home\\Programming\\blog projects\\blog generator')

let permaLines = []

let generatingWebsite = false
let waitingToGenerateWebsite = false
async function generateWebsite() {
    await spawn({
        cmd: ['bun', 'generateWebsite.js', 'previewMode']
    }).exited
}

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    underscore: '\x1b[4m',
    blink: '\x1b[5m',
    reverse: '\x1b[7m',
    hidden: '\x1b[8m',

    fg: {
        black: '\x1b[30m',
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
        crimson: '\x1b[38m' // Scarlet
    },
    bg: {
        black: '\x1b[40m',
        red: '\x1b[41m',
        green: '\x1b[42m',
        yellow: '\x1b[43m',
        blue: '\x1b[44m',
        magenta: '\x1b[45m',
        cyan: '\x1b[46m',
        white: '\x1b[47m',
        crimson: '\x1b[48m'
    }
}

// WebSocket server setup
const wss = new WebSocketServer({ port: 3001 })

wss.on('connection', (ws) => {
    ws.lastPong = 0
    ws.on('message', function (message) {
        if (message.toString() === 'pong')
            ws.lastPong = Date.now()
    })
})

function updateSite() {
    if (!generatingWebsite) {
        generatingWebsite = true
        generateWebsite().then(() => {
            wss.clients.forEach(client => {
                if (client.readyState === 1) // 1 means open
                    client.send('reload')
            })
            generatingWebsite = false
            if (waitingToGenerateWebsite) {
                waitingToGenerateWebsite = false
                updateSite()
            }
        })
    } else
        waitingToGenerateWebsite = true
}

function getBlogPostDirs(dir) {
    let blogPostDirs = []

    fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
        const fullPath = join(dir, dirent.name)
        if (dirent.isDirectory()) {
            if (dirent.name === 'node_modules')
                return
            if (dirent.name.startsWith('blogPost_'))
                blogPostDirs.push(fullPath)
            else
                blogPostDirs = blogPostDirs.concat(getBlogPostDirs(fullPath))
        }
    })

    return blogPostDirs
}

const blogPostDirs = getBlogPostDirs(resolve(__dirname, '..'))

let lastChangeTime = 0
chokidar.watch(blogPostDirs, {
    ignored: /(^|[\/\\])\../, // Ignore dotfiles
    persistent: true
}).on('all', (event, path) => {
    // console.log(`Event: ${event}, Path: ${path}`);
    if (event === 'change' || event === 'add' || event === 'unlink') {
        lastChangeTime = Date.now()
        updateSite()
    }
})

console.log('Watching', blogPostDirs.length, `post${blogPostDirs.length === 1 ? '' : 's'}:`, ...blogPostDirs.map(dir => '\n * .' + dir.split(resolve(__dirname, '..'))[1]))

const baseDirectory = './output'

const server = serve({
    async fetch(req) {
        const url = new URL(req.url)
        let path = decodeURIComponent(url.pathname)

        // Normalize root path to serve index.html
        if (path === '/') {
            path = '/index.html'
        }

        // Handle favicon requests without throwing an error
        if (path.startsWith('/favicon')) {
            return new Response(null, { status: 204 }); // No Content response
        }

        // Full file path
        let filePath = join(baseDirectory, path)

        // Check if the path has an extension to determine if it's a directory
        if (!extname(filePath)) {
            filePath = join(filePath, 'index.html')
        }

        // Serve the file
        try {
            const file = BunFile(filePath)
            const mimeType = getMimeType(filePath) || 'application/octet-stream'

            return new Response(file, {
                headers: { 'Content-Type': mimeType }
            })
        } catch (error) {
            console.error(`File not found: ${filePath}`, error)
            return new Response('File not found', { status: 404 })
        }
    }
})

setInterval(() => {
    wss.clients.forEach(client => {
        if (client.readyState === 1) // 1 means open
            client.send('ping')
    })
}, 100)

let lastKeyPressTime = 0

let lastLines = []
let consoleUpdateIndex = 0
const consoleUpdateChars = '⸺⟋|⟍'
function updateConsole() {
    const lines = []
    lines.push(`${colors.bright}[${colors.fg.magenta}${consoleUpdateChars[consoleUpdateIndex]}${colors.fg.white}] LIVE PREVIEW [${colors.fg.magenta}${(consoleUpdateChars[(4 - consoleUpdateIndex) % 4])}${colors.fg.white}]${colors.reset}`)
    lines.push(`${colors.fg.cyan}Hosting site at ${colors.fg.yellow}${colors.underscore}${server.url}${colors.reset}`)
    const numberOfConnections = Array.from(wss.clients).filter(ws => Date.now() - ws.lastPong < 1000).length
    lines.push(`${numberOfConnections === 0 ? colors.fg.red : colors.fg.green}There ${numberOfConnections === 1 ? 'is' : 'are'} ${numberOfConnections} connected websocket${numberOfConnections === 1 ? '' : 's'} for live previewing${colors.reset}`)
    lines.push(`${colors.fg.cyan}Watching ${colors.fg.yellow}${blogPostDirs.length}${colors.fg.cyan} post${blogPostDirs.length === 1 ? '' : 's'}: ${blogPostDirs.map(path => `${colors.fg.yellow}${path.split('blogPost_')[1]}`).join(`${colors.fg.cyan}, `)}${colors.reset}`)
    if (Date.now() - lastChangeTime < 1000)
        lines.push(`${colors.fg.green}CHANGE DETECTED${colors.reset}`)
    if (generatingWebsite)
        lines.push(`${colors.fg.yellow}GENERATING FOLDER${colors.reset}`)
    if (waitingToGenerateWebsite)
        lines.push(`${colors.fg.red}WAITING TO REGENERATE FOLDER${colors.reset}`)
    if (Date.now() - lastKeyPressTime < 1000)
        lines.push(`${colors.bright}Press CTRL+c to exit${colors.reset}`)

    lines.push(...permaLines)

    lastLines.forEach((line, index) => {
        if (lines.length <= index)
            process.stdout.write(`\x1b[${index + 1};0H \x1b[2K`)
    })

    lines.forEach((line, index) => {
        if (line !== lastLines[index]) {
            process.stdout.write(`\x1b[${index + 1};0H \x1b[2K`)
            console.log(line)
        }
    })

    lastLines = lines

    consoleUpdateIndex = (consoleUpdateIndex + 1) % 4
}
process.stdout.write('\x1B[2J\x1B[0f')
process.stdout.write('\x1b[?25l')
setInterval(updateConsole, 100)
updateConsole()

const readline = require('readline')

readline.emitKeypressEvents(process.stdin)

if (process.stdin.isTTY)
    process.stdin.setRawMode(true)

process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
        process.stdout.write('\x1B[2J\x1B[0f')
        process.stdout.write(`\x1b[0;0H \x1b[2K`)
        process.stdout.write('\x1b[?25h')
        process.exit()
    }
    lastKeyPressTime = Date.now()
})