import { Context as nContext} from "vm";
import { Context } from "./context";
import { Tokenizer } from "./tokenizer";
import { escapeQuotes, parseError } from "./utils";
import { runCallback } from "./index";


export class Runner {

    private context: Context;
    private tokenizer = new Tokenizer();

    constructor(options: nContext | undefined) {
        this.context = new Context({
            setTimeout,
            setInterval,
            setImmediate,
            clearImmediate,
            clearInterval,
            clearTimeout,
            ...options
        });
    }

    /**
     * parse an view's code to a corresponding html code to rende
     * 
     * @param {string} code the view content
     * @param {runCallback} callback the function who will be called after the execution
     */
    public run(code: string, callback: runCallback): void {
        this.parseCode(code)
            .then((result: string | Error[]) => {
                if (Array.isArray(result)) {
                    callback(result[0] as any);
                } else {
                    callback(null, result);
                }

            })
            .catch(err => {
                callback(err);
            });
    }

    /**
     * run a code in the context
     * 
     * @param code the code to parse and run
     * @returns {Promise<string|Error[]>} the result returned by the context
     */
    private async parseCode(code: string): Promise<string | Error[]> {
        let tokens = await this.tokenizer.tokenize(code);

        code = tokens.map(({ value, scope }) => {

            if (scope === "block")
                return "\n" + value + "\n";
            if (scope === "write")
                return "write(" + value + ");";
            if (scope === "text") 
                return "write(\"" + escapeQuotes(value).split(/\r\n|\n/g).join("\\n\"+\n\"") + "\");";

        }).join("");

        return this.context.run(code)
        
    }

}
