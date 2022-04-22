import { promises } from "fs";
import { relative } from "path";
import { Context , createContext } from "vm"
import { Runner } from "./runner";
import { parseError, getRequirer} from "./utils";

export interface runCallback {
    (error: string | null, result?: string): void
}

/**
 * parse a view and invoke the callback function that will rende the result .
 * this function can be use as view enginer context in an express application
 * ```js
 *  const exp = require("expviewer")
 *  ...
 *  const app = express()
 *  app.engine("exp", exp)
 *  app.set('view engine', 'exp')
 * ```
 * 
 * @param {string} view the view file to rende
 * @param {Context} options the default globals to declare in the context
 * @param {runCallback} callback the function that will be invoked after the parsing
 */
export default function expviewer(view: string, options?: Context, callback?: runCallback) {
    let main = getRequirer(__dirname, __filename)
    let defaults = {
        // context __dirname and __filename variable should target the requirer filename and dirname
        __dirname: main?.path,
        __filename: main?.filename,
        // local module should be loaded from the requirer directory
        __module: relative(__dirname, main?.path||"").replace(/\\/g, "/").replace(/(\w)$/gi, "$1/").replace(/^(\w)/gi, "./$1"),
        __view: view
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
        runner.run(data.toString(), view, callback!!)
    }).catch(err => {
        callback!!(parseError(err))
    })
}
