import { Context as nContext } from "vm";
import { Context } from "./context";
import { runCallback } from "./index";
import { relative } from "path";
import Builder from "./builder";
import { getRequirer } from "./utils";
import { SourceMapConsumer } from "source-map";


export class Runner {
    /**
     * @property the context in which te script will be executed
     */
    private context: Context;

    private builder = new Builder()

    constructor(options: nContext | undefined) {
        let main = getRequirer(__dirname, __filename)
        let defaults = {
            // context __dirname and __filename variable should target the requirer filename and dirname
            __dirname: main?.path,
            __filename: main?.filename,
            // local module should be loaded from the requirer directory
            __module: relative(__dirname, main?.path || "").replace(/\\/g, "/").replace(/(\w)$/gi, "$1/").replace(/^(\w)/gi, "./$1")
        }
        this.context = new Context({
            setTimeout,
            setInterval,
            setImmediate,
            clearImmediate,
            clearInterval,
            clearTimeout,
            ...defaults,
            ...options
        });
    }

    /**
     * parse an view's code to a corresponding html code to rende
     * 
     * @param {string} code the view content
     * @param {runCallback} callback the function who will be called after the execution
     */
    public async run(content: string, source: string, callback: runCallback): Promise<void> {
        await this.builder.wait()

        let { code, map } = this.builder.build(content, source, "main.bundle.js")

        let consumer = await new SourceMapConsumer(map.toJSON())

        if (this.builder.includeErrors.length > 0) {
            let error = this.builder.includeErrors.map(({ source, line, column, error, node }) => {
                let gens = consumer.allGeneratedPositionsFor({ source, line, column })
                
                let traces = gens.map(gen => this.builder.getIncludeTraces(source!, gen.line!, gen.column!, consumer, [`${source}:${line}:${column}`])
                    .filter(v => !v.match("null:null:null"))
                    .map(t => "    at " + t)
                )
                
                return traces.map(stack => ({
                    msg: error.name + ": " + error.message,
                    stack
                }))
            })[0][0]
            if(error){
                return callback(`${error.msg}\n${error.stack.join('\n')}`)
            }
        }

        let last: { generatedLine: number, generatedColumn: number } = (map as any)._mappings._last

        this.context.run(code, consumer.file)
            .then((result: string) => {
                callback(null, result);

            })
            .catch((error: Error | string) => {
                if (error instanceof SyntaxError) {
                    let [file, _, col] = error.stack?.split("\n")!
                    let accurate = true
                    let coln = Math.max(0, col.indexOf("^"))
                    file = file.replace(new RegExp(`${consumer.file}:(\\d+)(:(\\d+))?`, "g"), (f, ln, _, col) => {
                        let li = Number(ln)
                        let cl = Number(col || coln)
                        let { source, line, column } = consumer.originalPositionFor({ line: li, column: cl })
                        if (!line) {
                            accurate = false
                            if (cl > last.generatedColumn) cl = last.generatedColumn
                            if (li > last.generatedLine) li = last.generatedLine

                            let npos = consumer.originalPositionFor({ line: li, column: cl })

                            source = npos.source
                            line = npos.line
                            column = npos.column
                        }

                        return this.builder.getIncludeTraces(source!, li, cl, consumer, [`${source}:${line}:${column}`]).map(t => "    at " + t).join("\n")
                    })

                    return callback(`${accurate ? "" : "the error must not be in the exact position\n check for syntax error in your views may be closing tags\n\n"}${error.name}: ${error.message}\n${file}`)
                }
                if (typeof error === "string") {
                    let [message, ...stack] = error.split(/\n/)

                    let stacks = stack.map(stk => {
                        let m = Array.from((stk as string).matchAll(new RegExp(`.+?${consumer.file}:(\\d+):(\\d+)`, "g")))[0]
                        if (!m) return null
                        let [_, ln, col] = m

                        let { source, line, column } = consumer.originalPositionFor({ line: Number(ln), column: Number(col) })

                        return this.builder.getIncludeTraces(source!, Number(ln), Number(col), consumer, [`${source}:${line}:${column}`]).map(t => "    at " + t)
                    }).filter(v => !!v) as Array<string[]>

                    let stk: string[] = []
                    for (let s of stacks) {
                        if (s.length > stk.length) stk = s
                    }

                    return callback(`${message}\n${stk.join("\n")}`);
                }

            })
            .finally(() => {
                consumer.destroy()
            });
    }

}
