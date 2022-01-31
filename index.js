// @ts-nocheck
const fs = require('fs');
const { resolve, relative, basename } = require("path")
const util = require("util")
const { getGrammar, tokenizeLine2, tokenize } = require('./src/tokenizer');
const vm = require("vm")
const prettier = require("prettier");
// let {colors} = require("./src/ansi-styles")

function escapeQuotes(code) {
    let map = {
        "'": "\\'",
        '"': '\\"',
        "`": "\\`"
    }
    return code.replace(/['"`]/g, m => map[m])
}

function escapeUL(code) {
    return escapeQuotes(code).split(/\r\n|\n/g).join("")
}

function parseError(err, context) {
    return err.stack.split(/\r\n|\n/)
    .replace(/\u001b\[\d+m/g, "")
        .slice(0, 2).join("\n")
        .replace(/at evalmachine.<anonymous>(:\d+).+?$/gim, "at " + context.__view + "$1")
}

function escapeJsString(str = "") {
    let map = {
        '"': "\"",
        "'": "\'",
        "\\": "\\\\",
        "\b": "\\b",
        "\f": "\\f",
        "\t": "\\t",
        "\n": "\\n",
        "\v": "\\v"
    }
    return (str + "").replace(/[\\'"\b\t\n\v\f]/gis, m => map[m])
}

function escapeHtml(str = "") {
    let map = {
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "\'"
    }
    return (str + "").replace(/["'<>]/gis, m => map[m])
}

const scopeName = "text.html.exp"

function expressor(view, viewContext, callback) {
    if (arguments.length == 2 && typeof viewContext == "function") {
        callback = viewContext
        viewContext = {}
    }

    viewContext.__view = view

    fs.readFile(view, (err, data) => {
        if (err) return callback(parseError(err, viewContext))
        return codeExp(data.toString("utf8"), viewContext, callback)
    })
}

function codeExp(code, viewContext, callback) {
    if (arguments.length == 2 && typeof viewContext == "function") {
        callback = viewContext
        viewContext = {}
    }
    viewContext = {
        __dirname: require.main.path,
        __filename: require.main.filename,
        __module: relative(__dirname, require.main.path),
        ...viewContext
    }
    let context = vm.createContext(viewContext)
    context.output = ""
    context.print = function (value = "") {

        context.output += value
    }

    context.println = function (value = "") {
        context.print(value)
        context.output += "\n"
    }

    context.write = context.print

    context.writeJs = (value = "") => {
        if (["boolean", "number", "undefined", "bigint"].includes(typeof value == "")) {
            context.output += value
            return;
        }

        context.output += escapeJsString(util.format(value))
    }

    context.writeHtml = (value = "") => {

        context.output += escapeHtml(util.format(value))
    }

    context.require = require
    context.process = process
    context.__projectRoot = resolve("../../")
    context.__moduleRoot = "../../"
    context.__errors = []
    context.$__type = ""
    context.__parseError = parseError

    parseCode(code, context).then(code => {
        if (context.__errors.length > 0) {
            return callback(context.__errors)
        }
        callback(null, code)
    }).catch(err => {
        console.log(err)
        callback(err)
    })
}


async function parseCode(code, context) {

    let tokens = tokenizeLine2(await getGrammar(scopeName), code)
    let pctx = "exp"
    let tokensCode = tokens.map(({ scope, value, ctx }, i, p) => {
        if (i > 0) {
            pctx = p[i - 1].ctx != "exp" ? p[i - 1].ctx : pctx
        } else {
            pctx = ctx
        }
        if (scope === "block") return "\n" + value + "\n"
        if (scope === "write") return "write(" + value + ");"
        if (scope === "text") return "write(\"" + escapeQuotes(value).split(/\r\n|\n/g).join("\\n\"+\n\"") + "\");"
    }).join("")

    try {
        code = 'try{' + tokensCode + ' \n}catch(ex){\n\t__errors.push(__parseError(ex, this))\n}'

        console.log(code)

        vm.runInContext(code, context, { displayErrors: false })

        if (context.__errors.length > 0) return context.errors

        return context.output
    } catch (ex) {
        context.__errors.push(parseError(ex, context))
        return;
    }

}

class Expressor {
    _options = {}

    constructor(options = {}) {

        let defOptions = {
            __dirname: require.main.path,
            __filename: require.main.filename,
            __module: relative(__dirname, require.main.path)
        }

    }
}

module.exports = {
    codeExp,
    expressor
}