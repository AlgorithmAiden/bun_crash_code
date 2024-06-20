function addStat(parent, text) {
    let div = document.createElement('div')
    div.innerHTML = text
    parent.appendChild(div)
}
document.addEventListener('DOMContentLoaded', () => {
    fetch('../../mem.json')
        .then(response => response.json())
        .then(mem => {
            const div = document.getElementById('stats')
            addStat(div, `First published: <code>${Math.floor((Date.now() - mem.postsCreated[postName]) / 86400000)}</code> days ago`)
            addStat(div, `Last updated: <code>${Math.floor((Date.now() - mem.postsUpdated[postName]) / 86400000)}</code> days ago`)
            addStat(div, `Current hash: <code>${mem.postHashes[postName]}</code>`)
        })
        .catch(error => {
            console.error('Error fetching mem for stats:', error)
        })
})