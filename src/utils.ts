import path, { resolve } from "path"

export function escapeQuotes(code: string): string {
    let map: {[key: string]: string} = {
        "'": "\\'",
        '"': '\\"',
        "`": "\\`"
    }
    return code.replace(/['"`]/g, m => map[m])
}

export function escapeUL(code: string): string {
    return escapeQuotes(code).split(/\r\n|\n/g).join("")
}

/**
 * escape a string in javascript context to prevent 
 * 
 * @param {string} code javascript string to escape
 * @returns {string} the escaped code
 */
export function escapeJsString(code: string = ""): string {
    let map: {[key: string]: string} = {
        '"': "\"",
        "'": "\'",
        "\\": "\\\\",
        "\n": "\\\\n",
        "\v": "\\\\v",
        "\r\n": "\\\\r\\\\n"
    }
    return (code + "").replace(/("|'|\\|\r\n|\n|\v)/gis, m => map[m])
}

/**
 * escape html special character in a code
 * 
 * @param {string} code html code to escape
 * @returns {string} the escaped code
 */
export function escapeHtml(code: string = ""): string {
    let map: {[key: string]: string} = {
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "\'"
    }
    return (code + "").replace(/["'<>]/gis, m => map[m])
}

/**
 * transform a classic error to string , this is a helper to transform an error stackTrace
 * 
 * @param {Error} error an throwable object
 * @returns {string} the parsed error
 */
export function parseError(error: Error): string {
    return (error.stack ||(error.name +" :\t"+ error.message) ).split(/\r\n|\n/)
        .slice(0, 2).join("\n")
        .replace(/\u001b\[\d+m/g, "")
}

export function getRequirer(dir?: string, file?: string): null|undefined|NodeModule{
    let mod: NodeModule | undefined
    for(let i in require.cache){
        let mo = require.cache[i]
        if((mo?.path == dir || path.dirname(mo?.filename||"") == dir) && mo?.filename == file){
            mod = mo
            break
        }
    }
    if(mod) return mod?.parent
}

/**
 * @constant {object} Grammars the grammars registry for tokenization
 */
export const Grammars: {[key: string]: string} = {
    "source.exp.lang": resolve(__dirname, '../syntaxes/ExpLang.tmLanguage.json')
}