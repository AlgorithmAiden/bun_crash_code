const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
    ;
(async () => {
    function execAsync(command, options) {
        return new Promise((resolve, reject) => {
            exec(command, options, (error, stdout, stderr) => {
                if (error) {
                    reject(error)
                } else {
                    resolve(stdout || stderr)
                }
            })
        })
    }

    process.chdir('C:\\Users\\jack\\Home\\Programming\\blog projects\\blog generator')

    let mem = JSON.parse(fs.readFileSync('./mem.json', 'utf8'))

    const fileHashes = mem.fileHashes
    const lastFileHashes = mem.lastFileHashes ?? {}

    let addedFiles = []
    let changedFiles = []
    let removedFiles = []

    Object.keys(fileHashes).forEach(key => {
        if (lastFileHashes[key] == undefined)
            addedFiles.push(key)
        else if (lastFileHashes[key] != fileHashes[key])
            changedFiles.push(key)
    })
    Object.keys(lastFileHashes).forEach(key => {
        if (fileHashes[key] == undefined)
            removedFiles.push(key)
    })

    const totalChanges = addedFiles.length + changedFiles.length + removedFiles.length
    if (totalChanges == 0) {
        console.log('No changes')
        return
    }

    let changes = []
    if (addedFiles.length > 0) changes.push(`added ${addedFiles.length} file${addedFiles.length == 1 ? '' : 's'}: ${addedFiles.join(', ')}`)
    if (changedFiles.length > 0) changes.push(`changed ${changedFiles.length} file${changedFiles.length == 1 ? '' : 's'}: ${changedFiles.join(', ')}`)
    if (removedFiles.length > 0) changes.push(`removed ${removedFiles.length} file${removedFiles.length == 1 ? '' : 's'}: ${removedFiles.join(', ')}`)

    let commitMessage

    if (changes.length == 1) {
        commitMessage = changes[0]
        commitMessage = commitMessage.charAt(0).toUpperCase() + commitMessage.slice(1)
    } else commitMessage = `${totalChanges} changes: ${changes.join(', ')}`

    process.chdir('.\\output')

    try {
        // Check if .git directory exists, if not, initialize a new repository
        try {
            fs.accessSync(path.join('./', '.git'))
        } catch {
            await execAsync(`git init`, { cwd: './' })
            await execAsync(`git remote add origin https://github.com/AlgorithmAiden/jacks_project_hub.git`, { cwd: './' })
        }

        // Ensure the main branch exists
        try {
            await execAsync(`git checkout -b main`, { cwd: './' })
        } catch {
            await execAsync(`git checkout main`, { cwd: './' })
        }

        // Add all changes to staging
        await execAsync(`git add .`, { cwd: './' })

        // Commit the changes
        await execAsync(`git commit -m "${commitMessage}"`, { cwd: './' })

        // Force push the changes to the remote repository
        await execAsync('git push -f origin main', { cwd: './' })

        console.log(commitMessage)

        mem.lastFileHashes = fileHashes
        fs.writeFileSync('../mem.json', JSON.stringify(mem), 'utf8')
    } catch (error) {
        console.error('Error pushing changes to GitHub:', error)
    }
})()