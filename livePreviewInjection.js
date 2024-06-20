let ws
let lastPing = 0
function heartbeat() {
    if (Date.now() - lastPing >= 1000) {
        ws = new WebSocket('ws://localhost:3001')
        ws.onmessage = (event) => {
            if (event.data === 'reload') location.reload()
            else if (event.data === 'ping') {
                lastPing = Date.now()
                ws.send('pong')
            }
        }
    }
    setTimeout(heartbeat, 250)
}
heartbeat()