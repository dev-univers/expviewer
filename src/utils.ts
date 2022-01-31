import { resolve } from "path"

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
        "\f": "\\f",
        "\t": "\\t",
        "\n": "\\n",
        "\v": "\\v"
    }
    return (code + "").replace(/[\\'"\t\n\v\f]/gis, m => map[m])
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

/**
 * @constant {object} Grammars the grammars registry for tokenization
 */
export const Grammars: {[key: string]: string} = {
    'source.exp.js': resolve(__dirname, '../syntaxes/JavaScript.exp.tmLanguage.json'),
    'source.exp.css': resolve(__dirname, '../syntaxes/css.exp.tmLanguage.json'),
	'text.html.exp': resolve(__dirname, '../syntaxes/html.exp.tmLanguage.json'),
    'source.exp': resolve(__dirname, '../syntaxes/exp.tmLanguage.json')
}
