function cssRuleFromStyles(defaultStyle, style, scale = 1) {
    let out = []
    Object.keys(style).forEach(key => {
        if (defaultStyle[key] != style[key]) {
            const value = style[key]
            if (key == 'color')
                out.push(`color:${value}`)
            else if (key == 'italic')
                out.push(`font-style:${value ? 'italic' : 'normal'}`)
            else if (key == 'bold')
                out.push(`font-weight:${value ? 'bold' : 'normal'}`)
            else if (key == 'size')
                if (scale == 1)
                    out.push(`font-size:${value}`)
                else
                    out.push(`font-size:calc(${value} * ${scale})`)
            else if (key == 'strike')
                out.push(`text-decoration: ${value ? 'line-through' : 'none'}`)
        }
    })
    return out.join('; ') + ';'
}

function err(message) {
    throw new Error(`Error parsing markup: ${message}`)
}

//some helper functions to make more readable code

/**
 * charAt + toLowerCase
 */
const lca = (str, i) => str.charAt(i).toLowerCase()

/**
 * slice + toLowerCase
 */
const ls = (str, start, stop) => str.slice(start, stop).toLowerCase()

//used so I can check nextProp without it existing
const emptyString = new Array(2 ** 16).fill(' ').join('')

//the script injected into the output html
function script() {
    (() => {
        const wrapper = document.currentScript.parentNode
        function setValue(key, value) {
            let saveData = sessionStorage.getItem('markup') != undefined ? JSON.parse(sessionStorage.getItem('markup')) : {}
            saveData[key] = value
            sessionStorage.setItem('markup', JSON.stringify(saveData))
        }
        function getValue(key) {
            return (sessionStorage.getItem('markup') != undefined ? JSON.parse(sessionStorage.getItem('markup')) : {})[key]
        }
        function removeKey(key) {
            let saveData = sessionStorage.getItem('markup') != undefined ? JSON.parse(sessionStorage.getItem('markup')) : {}
            delete saveData[key]
            sessionStorage.setItem('markup', JSON.stringify(saveData))
        }
        document.addEventListener('DOMContentLoaded', () => {
            [...wrapper.getElementsByClassName('folder')].forEach(folder => {
                if (getValue(`id_${folder.dataset.id}`) != undefined) {
                    const children = folder.children
                    const open = getValue(`id_${folder.dataset.id}`)
                    children[0].innerHTML = children[0].innerHTML.replace(open ? 'open' : 'close', open ? 'close' : 'open')
                    children[1].style.display = open ? '' : 'none'
                }
            })
        })
        if (window.markup == undefined) {
            window.markup = {
                folder(event) {
                    event.stopPropagation()
                    const folder = event.target.closest('.folder')
                    const children = folder.children
                    const open = children[1].style.display == 'none'
                    children[0].innerHTML = children[0].innerHTML.replace(open ? 'open' : 'close', open ? 'close' : 'open')
                    children[1].style.display = open ? '' : 'none'
                    setValue(`id_${folder.dataset.id}`, open)
                }
            }
        }
    })()
}

let nextGlobalId = 0 //used for anything that needs a unique identifier

module.exports = {
    defaultStyle: {
        color: '#0f0',
        italic: false,
        bold: false,
        size: 'medium',
        code: false,
        align: 'left',
        showMarkup: false,
        strike: false
    },
    tabSize: 3,
    stripTags(rawMarkup, breakCode = '\n') {
        return rawMarkup.split('\r\n').filter(line => line.slice(0, 10) != '|[COMMENT]').join('').split('|[').filter(part => part != '').map(part => {
            if (part.slice(0, 1) == '|') return '|[' + part.slice(1)
            if (part.includes(']')) return [[part.slice(0, part.indexOf(']'))], part.slice(part.indexOf(']') + 1)]
            return part
        }).flat(1).reduce((acc, part) => {
            if (typeof part == 'string')
                if (acc.length > 0 && typeof acc[acc.length - 1] == 'string') {
                    acc[acc.length - 1] += part
                    return acc
                }
                else
                    return [...acc, part]
            while (part.some(part => part.includes(' ')))
                part = part.map(part => part.split(' ')).flat()
            let inPar = false
            part = part.reduce((acc, part) => {
                if (inPar)
                    acc[acc.length - 1] += ' ' + part
                else acc = [...acc, part]
                if (part.indexOf('(') > -1)
                    inPar = part.indexOf('(') > part.indexOf(')')
                else
                    inPar = part.indexOf(')') == -1 && inPar
                return acc
            }, [])
            part = part.filter(item => item != '')
            if (part.length == 0)
                return acc
            else
                return [...acc, part]
        }, []).filter(part => part != '').map(part => {
            if (typeof part === 'string') return part
            return part.reduce((acc, tag) => {
                if (tag === 'break') acc += breakCode
                return acc
            }, '')
        }).join('')
    },
    translate(rawMarkup, scale = 1) {
        markup = rawMarkup.split('\r\n').filter(line => line.slice(0, 10) != '|[COMMENT]').join('').split('|[').filter(part => part != '').map(part => {
            if (part.slice(0, 1) == '|') return '|[' + part.slice(1)
            if (part.includes(']')) return [[part.slice(0, part.indexOf(']'))], part.slice(part.indexOf(']') + 1)]
            return part
        }).flat(1).reduce((acc, part) => {
            if (typeof part == 'string')
                if (acc.length > 0 && typeof acc[acc.length - 1] == 'string') {
                    acc[acc.length - 1] += part
                    return acc
                }
                else
                    return [...acc, part]
            while (part.some(part => part.includes(' ')))
                part = part.map(part => part.split(' ')).flat()
            let inPar = false
            part = part.reduce((acc, part) => {
                if (inPar)
                    acc[acc.length - 1] += ' ' + part
                else acc = [...acc, part]
                if (part.indexOf('(') > -1)
                    inPar = part.indexOf('(') > part.indexOf(')')
                else
                    inPar = part.indexOf(')') == -1 && inPar
                return acc
            }, [])
            part = part.filter(item => item != '')
            if (part.length == 0)
                return acc
            else
                return [...acc, part]
        }, []).filter(part => part != '')

        let defaultStyle = { ...this.defaultStyle }

        let style = { ...defaultStyle }

        let lastAlign

        let folds = []

        let needScript = false

        let html = ''

        let nextLine = ''

        markup.forEach(props => {
            if (typeof props == 'string') {
                if (style.align != lastAlign) {
                    if (lastAlign != undefined)
                        html += '</div>'
                    html += `<div style="text-align:${style.align};">`
                    lastAlign = style.align
                }
                const cssRules = cssRuleFromStyles(defaultStyle, style, scale)
                let text = nextLine + props
                if (style.code) text = `<code>${text}</code>`
                if (cssRules.length == 1) //take the ; into account
                    html += text
                else
                    html += `<span style="${cssRules}">${text}</span>`
                nextLine = ''
            } else {
                if (style.showMarkup)
                    nextLine += `|[${props.join(' ')}]`
                for (let index = 0; index < props.length; index++) {
                    const prop = props[index]
                    const nextProp = props[index + 1] ?? emptyString
                    const lowerProp = prop.toLowerCase()

                    if (lowerProp == 'color') {
                        if (ls(nextProp, 0, 1) == '#') { //must be hex
                            if (nextProp.length == 4) //is in format #rgb
                                style.color = nextProp.toLowerCase()
                            else if (nextProp.length == 5) //is in format #rgba
                                if (ls(nextProp, 4, 5) == 'f') //check if alpha is needed
                                    style.color = ls(str, 0, 4)
                                else
                                    style.color = nextProp.toLowerCase()
                            else if (nextProp.length == 7) //is in format #rrggbb
                                if (lca(nextProp, 1) == lca(nextProp, 2) && lca(nextProp, 3) == lca(nextProp, 4) && lca(nextProp, 5) == lca(nextProp, 6)) //check if the color can be shortened
                                    style.color = ('#' + lca(nextProp, 1) + lca(nextProp, 3) + lca(nextProp, 5)).toLowerCase()
                                else
                                    style.color = nextProp.toLowerCase()
                            else if (nextProp.length == 9) //is in format #rrggbbaa
                                if (nextProp.slice(7, 9).toLowerCase() == 'ff') //check if alpha is needed
                                    if (lca(nextProp, 1) == lca(nextProp, 2) && lca(nextProp, 3) == lca(nextProp, 4) && lca(nextProp, 5) == lca(nextProp, 6)) //check if the color can be shortened
                                        style.color = ('#' + lca(nextProp, 1) + lca(nextProp, 3) + lca(nextProp, 5)).toLowerCase()
                                    else
                                        style.color = nextProp.slice(0, 7).toLowerCase()
                                else
                                    if (lca(nextProp, 1) == lca(nextProp, 2) && lca(nextProp, 3) == lca(nextProp, 4) && lca(nextProp, 5) == lca(nextProp, 6) && lca(nextProp, 7) == lca(nextProp, 8)) //check if the color can be shortened
                                        style.color = ('#' + lca(nextProp, 1) + lca(nextProp, 3) + lca(nextProp, 5) + lca(nextProp, 7)).toLowerCase()
                                    else
                                        style.color = nextProp.toLowerCase()
                            else err(`invalid hex code`)
                        } else if (ls(nextProp, 0, 3) == 'rgb') {
                            try {
                                const digits = nextProp.toLowerCase().slice(lca(nextProp, 3) == 'a' ? 5 : 4).split(')')[0].split(',').map(digit => Math.max(0, Math.min(255, Math.round(Number(digit.trim())))).toString(16).padStart(2, '0')).filter((digit, index) => digit != 'ff' || index != 3)
                                if (digits.every(digit => digit.charAt(0) == digit.charAt(1)))
                                    style.color = '#' + digits.reduce((acc, digit) => acc + digit.charAt(0), '')
                                else
                                    style.color = '#' + digits.reduce((acc, digit) => acc + digit, '')
                            } catch {
                                err('invalid rgb')
                            }
                        } else
                            style.color = defaultStyle.color
                    }

                    else if (lowerProp == 'italic') {
                        if (['on', 'true'].includes(nextProp.toLowerCase()))
                            style.italic = true
                        else if (['off', 'false'].includes(nextProp.toLowerCase()))
                            style.italic = false
                        else
                            style.italic = !style.italic
                    }

                    else if (lowerProp == 'bold') {
                        if (['on', 'true'].includes(nextProp.toLowerCase()))
                            style.bold = true
                        else if (['off', 'false'].includes(nextProp.toLowerCase()))
                            style.bold = false
                        else
                            style.bold = !style.bold
                    }

                    else if (lowerProp == 'space') {
                        try {
                            const count = Math.round(Number(nextProp))
                            if (count > 0 && !isNaN(count))
                                nextLine += new Array(count).fill('&nbsp;').join('')
                            else
                                nextLine += '&nbsp;'
                        } catch {
                            nextLine += '&nbsp;'
                        }
                    }

                    else if (lowerProp == 'tab') {
                        try {
                            const count = Math.round(Number(nextProp) * this.tabSize)
                            if (count > 0 && !isNaN(count))
                                nextLine += new Array(count).fill('&nbsp;').join('')
                            else
                                nextLine += new Array(this.tabSize).fill('&nbsp;').join('')
                        } catch {
                            nextLine += new Array(this.tabSize).fill('&nbsp;').join('')
                        }
                    }

                    else if (lowerProp == 'break') {
                        if (Number(nextProp) > 0)
                            nextLine += `<div style="display:block; height:${Number(nextProp)}em; line-height:${Number(nextProp)}em;"></div>`
                        else
                            nextLine += '<br>'
                    }

                    else if (lowerProp == 'size') {
                        if (['xx-small', 'x-small', 'smaller', 'small', 'medium', 'large', 'larger', 'x-large', 'xx-large'].includes(nextProp.toLowerCase()))
                            style.size = nextProp.toLowerCase()
                        else if (Number(nextProp) > 0)
                            style.size = `${Number(nextProp)}px`
                        else
                            style.size = defaultStyle.size
                    }

                    else if (lowerProp == 'code') {
                        if (['on', 'true'].includes(nextProp.toLowerCase()))
                            style.code = true
                        else if (['off', 'false'].includes(nextProp.toLowerCase()))
                            style.code = false
                        else
                            style.code = !style.code
                    }

                    else if (lowerProp == 'align') {
                        if (['left', 'center', 'right'].includes(nextProp.toLowerCase()))
                            style.align = nextProp.toLowerCase()
                        else
                            style.align = defaultStyle.align
                    }

                    else if (lowerProp == 'reset') {
                        if (Object.keys(defaultStyle).includes(nextProp.toLowerCase()))
                            style[nextProp.toLowerCase()] = defaultStyle[nextProp.toLowerCase()]
                        else
                            Object.keys(defaultStyle).forEach(key => style[key] = defaultStyle[key])

                    }

                    else if (lowerProp == 'default') {
                        if (nextProp.toLowerCase() == 'global')
                            Object.keys(style).forEach(key => this.defaultStyle[key] = style[key])
                        Object.keys(style).forEach(key => defaultStyle[key] = style[key])
                    }

                    else if (lowerProp == 'fold') {
                        needScript = true
                        if (['open', 'close'].includes(nextProp.toLowerCase())) {
                            let foldId = folds.length + 1
                            while (rawMarkup.includes(`fold_${foldId}`))
                                foldId++
                            folds.push({
                                id: foldId,
                                style: { ...style },
                                open: nextProp.toLowerCase() == 'open'
                            })
                            if (lastAlign != undefined)
                                html += '</div>'
                            html += `fold_${foldId}`
                            html += `<div style="text-align:${style.align};">`
                        } else {
                            if (lastAlign != undefined)
                                html += '</div>'
                            lastAlign = undefined //to make the next line trigger a new block
                            const fold = folds.pop()
                            const content = html.split(`fold_${fold.id}`)[1]
                            html = html.slice(0, html.indexOf(`fold_${fold.id}`))
                            const cssRules = cssRuleFromStyles(defaultStyle, fold.style, scale)
                            let text = `|[click to ${fold.open ? 'close' : 'open'}]`
                            if (style.code) text = `<code>${text}</code>`
                            if (cssRules.length != 1)
                                text = `<span style="${cssRules}">${text}</span>`

                            html += `
                            <div class="folder" data-id=${nextGlobalId++}>
                                <div style="cursor: pointer; text-align:${fold.style.align};" onclick="window.markup.folder(event)">
                                    ${text}
                                </div>
                                <div ${fold.open ? '' : 'style="display:none;"'}>
                                    ${content}
                                </div>
                            </div>
                            `
                        }
                    }

                    else if (lowerProp == 'image') {
                        if (style.align != lastAlign) {
                            if (lastAlign != undefined)
                                html += '</div>'
                            html += `<div style="text-align:${style.align};">`
                            lastAlign = style.align
                        }
                        if (props.length > index + 1 && Number(props[index + 2]) > 0 && Number(props[index + 2] != 1))
                            html += `<br><img src="./${nextProp}" alt="${nextProp}" style="width:${Number(props[index + 2] * 100)}%">`
                        else
                            html += `<br><img src="./${nextProp}" alt="${nextProp}">`
                    }

                    else if (lowerProp == 'showmarkup') {
                        if (['on', 'true'].includes(nextProp.toLowerCase()))
                            style.showMarkup = true
                        else if (['off', 'false'].includes(nextProp.toLowerCase()))
                            style.showMarkup = false
                        else
                            style.showMarkup = !style.showMarkup
                    }

                    else if (lowerProp == 'video') {
                        if (style.align != lastAlign) {
                            if (lastAlign != undefined)
                                html += '</div>'
                            html += `<div style="text-align:${style.align};">`
                            lastAlign = style.align
                        }
                        if (props.length > index + 1 && Number(props[index + 2]) > 0 && Number(props[index + 2] != 1))
                            html += `<br><video src="./${nextProp}" controls alt="${nextProp}" style="width:${Number(props[index + 2] * 100)}%"></video>`
                        else
                            html += `<br><video src="./${nextProp}" controls alt="${nextProp}"></video>`
                    }

                    else if (lowerProp == 'strike') {
                        if (['on', 'true'].includes(nextProp.toLowerCase()))
                            style.strike = true
                        else if (['off', 'false'].includes(nextProp.toLowerCase()))
                            style.strike = false
                        else
                            style.strike = !style.strike
                    }

                    else if (lowerProp == 'script' && nextProp != undefined) {
                        nextLine += `<script src="${nextProp}"></script>`
                    }
                }
            }
        })

        if (nextLine != '') {
            if (style.align != lastAlign) {
                if (lastAlign != undefined)
                    html += '</div>'
                html += `<div style="text-align:${style.align};">`
                lastAlign = style.align
            }
            const cssRules = cssRuleFromStyles(defaultStyle, style, scale)
            if (style.code) nextLine = `<code>${nextLine}</code>`
            if (cssRules.length == 1) //take the ; into account
                html += nextLine
            else
                html += `<span style="${cssRules}">${nextLine}</span>`
        }

        if (lastAlign != undefined)
            html += '</div>'

        let wrapperStyle = cssRuleFromStyles({}, defaultStyle, scale)
        wrapperStyle += [
            'margin:0',
            'padding:0',
            'word-wrap:break-word',
            'width:100%',
            'height:100%'
        ].join('; ') + ';'

        const scriptString = script.toString().slice(12).split('\r\n').reduce((acc, part) => acc + '; ' + part.split('//')[0], '').split('').reduce((acc, part, index, arr) => {
            if (index >= arr.length - 3) return acc
            if (part == ' ' && acc.charAt(acc.length - 1) == ' ')
                return acc
            return acc + part
        }, '').split('{; ').join('{').split('; }').join('}').split('; ').reduce((acc, part) => {
            if (acc.slice(acc.length - 2) == '; ' && part == '') return acc
            return acc + part + '; '
        }, '')

        return `
        <div class="markup" style="${wrapperStyle}">${needScript ? `\r\n<script>${scriptString}</script>` : ''}
            ${html}
        </div>
        `
    }
}

/**
This markup uses tags in |[] clumps mixed with text to style. 
the text is evaluated from beginning to end, any text being rendered using the current style.
to change the style, add |[] with tags and values inside, this sets the style for everything after, until changes.
tags are evaluated by order they appear, in a |[].
tags are found by scanning for |[ and reading until ], and are separated by spaces.
to render a |[ you can put |[|, this will not read tags like normal.
you can put ] anywhere, and unless it is closing a tag area it will render.
the tags are below, items in the first column are the keywords, items in the second column are values to be used.
a !-> in the second column indicates the action that happens if non of the other options are there
values in the second column with a [] signify that you put a value there (but don't include the [])
values in the second column with a ?[] signify that the value is optional

 * color: -> sets the text color to the most efficient hex value that represents prop 1
 * * #[rgb] -> each range is in the value 0-f in base 16
 * * #[rgba]
 * * #[rrggbb]
 * * #[rrggbbaa]
 * * rgb([r],[g],[b]) -> each value is in the range 0-255
 * * rgb([r],[g],[b],[a])
 * * rgba([r],[g],[b])
 * * rgba([r],[g],[b],[a])
 * * !-> sets color to the default color
 * italic: -> sets whether text will be italic
 * * on | true
 * * off | false
 * * !-> toggles italics
 * bold: -> sets whether text will be bold
 * * on | true
 * * off | false
 * * !-> toggles bold text
 * space: -> adds [number] spaces using '&nbsp;' after
 * * [number]
 * * !-> defaults to 1
 * tabs: -> adds [number] spaces * tabSize (defaults to 3) after
 * * [number]
 * * !-> defaults to 1
 * break: -> used to make new lines
 * * [number] -> creates a break and then inserts a blank line of [number] lines in height, then second break
 * * !-> just adds <br>
 * size: -> sets the text size
 * * xx-small | x-small | smaller | small | medium | large | larger | x-large | xx-large -> uses the default sizes
 * * [number] -> (viewport width + viewport height) / 2 * [number], [number] is in the range [number] >= 0.02
 * * !-> sets size to the default size
 * code: -> sets whether text will be code using <code></code>
 * * on | true
 * * off | false
 * * !-> toggles code text
 * align: -> sets which direction text should align (changing align triggers a break)
 * * left | center | right
 * * !-> sets align to the default align
 * reset: 
 * * [property] -> sets [property] to the default [property]
 * * !-> resets the full style to the default style
 * default: -> changes the default used for many tags, but does not change the default retrospectively
 * * global -> sets the global default, this is the default used to generate the local (the default always used) default, also sets the local default 
 * * !-> sets the default style to the current style
 * fold: -> creates foldable content, with all content until the fold close being inside (fold triggers a break)
 * * open | close -> starts a fold that is open | closed at start
 * * !-> closes a fold
 * image: -> embeds an image in the next line
 * * [path] [size] -> size is relative to the div, so a size of 1 would fill the space, or a size of .5 could fit two images side by side
 * * [path] !-> defaults to 1
 * showMarkup: -> sets whether the markup tags will be hidden (defaults to false)
 * * on | true
 * * off | false
 * * !-> toggles
 * COMMENT: -> "comments" out the line, must be alone in the tag bracket, and the first thing in the line: |[COMMENT]
 * video: -> embeds a video in the next line
 * * [path] [size] -> size is relative to the div, so a size of 1 would fill the space, or a size of .5 could fit two videos side by side
 * * [path] !-> defaults to 1
 * strike: -> sets whether text will have strikethrough
 * * on | true
 * * off | false
 * * !-> toggles strikethrough
 * script: -> embeds a piece of live code
 * * [path] -> where to find the script


for example: to create 'before green it was boring' with 'green' being green you could use the following markup:
before |[color #0f0]green|[color] it was boring
the first tag clump sets the color to green (#0f0), the second clump resets color to the default
 */