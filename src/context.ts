import { relative, resolve } from "path";
import { Context as nContext, createContext, runInContext } from "vm"
import {escapeHtml, escapeJsString, getRequirer, parseError} from "./utils";


export class Context implements nContext {

    /**
     * the contextified object in which the code will run
     */
    public internalContext: nContext;
    /**
     * @property the path to the main running view
     */
    public __view: string = ""
    /**
     * @property the output variable that will receive the execution result
     */
    public output: string = ""
    /**
     * @property the global nodejs require to anable use of require in the run context
     */
    public require: NodeRequire = require
    public process = process
    /**
     * @property the list of errors encounted during execution
     */
    public __errors: string[] = []

    constructor(globals?: nContext) {
        let main = getRequirer(__dirname, __filename)

        this.internalContext = this.initContext({
            // context __dirname and __filename variable should target the requirer filename and dirname
            __dirname: main?.path,
            __filename: main?.filename,
            // local module should be loaded from the requirer directory
            __module: relative(__dirname, main?.path||"").replace(/\\/g, "/").replace(/(\w)$/gi, "$1/").replace(/^(\w)/gi, "./$1"),
            // with globals, requirer could override the previous defaults
            ...globals
        })

    }

    /**
     * run code in the context
     * 
     * @param {string} code string to run in the context
     */
     public run(code: string): Promise<string|Error[]> {
         let script = '"use-strict" ; this.___running = true; (async ()=>{try{ ' + code + '; this.___running = false;\n}catch(ex){\vthis.___running = false;__errors.push(ex)\n}})()'
        try {
            runInContext(script, this.internalContext, {
                filename: this.internalContext.__view
            })

            return new Promise((resolve, reject)=>{
                let t = setInterval(()=>{
                    if(!this.internalContext.___running){
                        clearInterval(t)
                        if (this.internalContext.__errors.length > 0) return reject(this.internalContext.__errors)
                        
                        resolve(this.internalContext.output)
                    }
                },10)
            })

        } catch (error) {
            this.internalContext.__errors.push(this.internalContext.error)
            return Promise.reject(this.internalContext.__errors);
        }

    }

    /**
     * insert a value in the context output
     * 
     * @param {string|any} code value to insert in the context output
     */
    public print(code: string | any) {
        this.output += ["string", "boolean", "number", "undefined", "bigint"].includes(typeof code) ? code : code
    }

    /**
     * insert a value in the context output and go to a new line
     * 
     * @param {string|any} code value to insert in the context output
     */
    public println(code: string) {
        this.print(code)
        this.print('\n')
    }

    /**
     * transform error to make it more readable for debugging
     * 
     * @param {Error} error an error to parse
     * @returns {string}
     */
    public parseError(error: Error): string {
        return parseError(error)
    }

    /**
     * write a value in the context output
     * 
     * @param {string|any} code value to insert in the context output
     */
    public write(code: string): void {
        this.print(code)
    }

    /**
     * parse an write a javascript value in the context output
     * 
     * @param {string|any} code value to insert in the context output
     */
    public writeJs(code: string): void {
        if (["boolean", "number", "undefined", "bigint"].includes(typeof code)) {
            this.output += code
            return;
        }

        this.output += escapeJsString(JSON.stringify(code))
    }

    /**
     * parse an write a html value in the context output
     * 
     * @param {string|any} code value to insert in the context output
     */
    public writeHtml(code: string): void {
        if (["boolean", "number", "undefined", "bigint"].includes(typeof code)) {
            this.output += code
            return;
        }

        if(typeof code == "string"){
            this.output += escapeHtml(code)
            return;
        }

        this.output += escapeHtml(JSON.stringify(code))
    }

    /**
     * escape html specials characters
     * 
     * @param {string} code string to escape
     */
    public escapeHtml(code: string): string {
        return escapeHtml(code)
    }

    /**
     * escape javascript specials characters
     * 
     * @param {string} code string to escape
     */
    public escapeJsString(code: string): string {
        return escapeJsString(code)
    }

    /**
     * initialize a context
     * 
     * @param {nContext} defaults the defaults globals
     * @returns {nContext} the contextified object based on this
     */
    private initContext(defaults: nContext): nContext{
        
        let ctx = createContext({
            ...this,
            ...defaults
        })

        ctx.print = this.print.bind(ctx)
        ctx.println =this.println.bind(ctx)
        ctx.parseError = this.parseError.bind(ctx)
        ctx.write = this.write.bind(ctx)
        ctx.writeJs = this.writeJs.bind(ctx)
        ctx.writeHtml = this.writeHtml.bind(ctx)
        ctx.escapeHtml = this.escapeHtml.bind(ctx)
        ctx.escapeJsString = this.escapeJsString.bind(ctx)

        return ctx
    }

}
