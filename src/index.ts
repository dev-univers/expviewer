import { promises } from "fs";
import { relative, resolve } from "path";
import { Context , createContext } from "vm"
import { Runner } from "./Runner";
import { parseError } from "./utils";

export interface runCallback {
    (error: string | null, result?: string): void
}

/**
 * parse a view and invoke the callback function that will rende the result .
 * this function can be use as view enginer context in an express application
 * ```js
 *  const expressor = require("expressor")
 *  ...
 *  const app = express()
 *  app.engine("exp", expressor)
 *  app.set('view engine', 'exp')
 * ```
 * 
 * @param {string} view the view file to rende
 * @param {Context} options the default globals to declare in the context
 * @param {runCallback} callback the function that will be invoked after the parsing
 */
export default function expressor(view: string, options?: Context, callback?: runCallback) {
    let defaults = {
        __dirname: require.main?.path,
        __filename: require.main?.filename,
        __module: relative(__dirname, require.main?.path!!),
        __root: resolve("../../.."),
        __view: view,
    }
    if (arguments.length == 2) {
        callback = options as runCallback
        options = createContext(defaults)
    } else {
        options = createContext({
            ...defaults,
            ...options
        })
    }

    let runner = new Runner(options)
    
    promises.readFile(view).then(data => {
        runner.run(data.toString(), callback!!)
    }).catch(err => {
        callback!!(parseError(err))
    })
}