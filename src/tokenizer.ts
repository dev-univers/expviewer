import { readFileSync, promises } from "fs"
import { resolve } from "path"
import { loadWASM, OnigScanner, OnigString } from "vscode-oniguruma"
import { IGrammar, INITIAL, parseRawGrammar, Registry, StackElement } from "vscode-textmate"
import { Grammars } from "./utils"

export interface TokenResult {
    value: string,
    ctx: string,
    scope: string
}

export interface LineToken {
    tokens: TokenResult[],
    ruleStack: StackElement
}

function getState(scopes: string) {
    return [
        { state: "delimiter", value: scopes.match(/punctuation\.section\.embedded\.(begin|end)\.exp/gi) },
        { state: "text", value: scopes.match(/(\.(html)(\.exp|))$/gi) },
        {
            state: "block",
            value: (_ => {
                let nscope = scopes.replace(/.+(meta\.embedded\.(block|line).+?)$/gi, "$1")
                return nscope.match(/meta\.embedded\.block\.exp/gi)
            })()
        },
        {
            state: "write",
            value: (_ => {
                let nscope = scopes.replace(/.+(meta\.embedded\.(block|line).+?)$/gi, "$1")
                return nscope.match(/meta\.embedded\.line\.exp/gi)
            })()
        },
        { state: "text", value: true }
    ].filter(({ value }) => value)[0].state
}

function getContext(ctx: string[]){
    return ["exp", "html", "js", "css"].includes(ctx[1])? ctx[1] : ctx[0]
}

export class Tokenizer {

    private scopeName = "source.exp"
    
    private registry: Registry

    constructor(){
        
        const wasmBin = readFileSync(resolve(__dirname, '../node_modules/vscode-oniguruma/release/onig.wasm')).buffer;
        const onigLib = loadWASM(wasmBin).then(() => {
            return {
                createOnigScanner(patterns: string[]) { return new OnigScanner(patterns); },
                createOnigString(s: string) { return new OnigString(s); }
            };
        });

        
        this.registry = new Registry({
            onigLib,
            loadGrammar: async (scopeName: string)=>{
                if(!!Grammars[scopeName]){
                    try{
                        return parseRawGrammar((await promises.readFile(Grammars[scopeName])).toString(), Grammars[scopeName])
                    }catch(err){
                        return parseRawGrammar("{}", "blank.json")
                    }
                    
                }
                return parseRawGrammar("{}", "blank.json")
            }
        })
    }

    get grammar(){
        return this.registry.loadGrammar(this.scopeName)
    }

    /**
     * help to tokenize an one-line string with a desired grammar
     * 
     * @param {IGrammar} grammar the grammar that will be used for tokenize line
     * @param {string} line the one-line string to tokenize
     * @param {StackElement} state the previous line tokenization stack
     * @returns {LineToken}
     */
    private tokenizeLine(grammar: IGrammar, line: string, state: StackElement = INITIAL): LineToken{
        let reusltLen = 0,
            result: TokenResult[] = [] ,
            {tokens, ruleStack} = grammar.tokenizeLine(line, state),
            lastScopes: string|null = null
        
        for(let j =0 ,lenJ = tokens.length; j<lenJ; j++){
            let {startIndex, scopes, endIndex} = tokens[j],
                value = line.substring(startIndex, endIndex),
                tokenScope = scopes.join(' ')
            
            if(lastScopes == tokenScope){
                result[reusltLen - 1].value = value
            }else{
                lastScopes = tokenScope
                result[reusltLen++] = {
                    value,
                    ctx: scopes.slice(-2).map(s=>s.split(".").slice(-1).join()).join(" "),
                    scope: getState(tokenScope)
                }
            }
        }

        return { tokens: result, ruleStack}
    }
    /**
     * tokenize a mutiline string to an array of tokens
     * 
     * @param {string|string[]} code multiline ( or array of ) string to tokenize
     * @returns {Promise<LineToken[]>}
     */
    private async tokenizeLines(code: string|string[]): Promise<LineToken[]> {
        if(!Array.isArray(code)) code = code.split(/\r\n|\n/)

        let state: StackElement|undefined,
            result: LineToken[] = [],
            grammar = await this.grammar

        for(let line of code){
            let lRes = this.tokenizeLine(grammar!!, line, state)
            result.push(lRes)
            state = lRes.ruleStack
        }

        return result
    }

    /**
     * tokenize a mutiline string to an array of tokens
     * 
     * @param {string} code multiline ( or array of ) string to tokenize
     * @returns {Promise<TokenResult[]>}
     */
    async tokenize(code: string): Promise<TokenResult[]>{

        let resultLen = 0,
            result: TokenResult[] = [] ,
            tmpRes: TokenResult[] = []

        let tokensList = (await this.tokenizeLines(code)).map(r=>r.tokens)

        for(let tokens of tokensList){
            let len = 0,
                tRes: TokenResult[]  = []
            
            for(let token of tokens){

                let ctx = getContext(token.ctx.split(" "))
                if (token.scope == 'delimiter') continue
                if (len == 0) {
                    tRes[len++] = {...token, ctx}
                    continue
                }
                if (tRes[len - 1].scope == token.scope) {
                    if(tRes[len - 1].ctx == ctx){
                        tRes[len - 1].value += token.value
                    } else {
                        tRes[len++] = {...token, ctx}
                    }
                }else{
                    tRes[len++] = {...token, ctx}
                }
            }
            tmpRes =  tmpRes.concat(tRes)
        }

        for (let token of tmpRes) {
        
            if (resultLen == 0) {
                result[resultLen++] = token
    
            } else if (result[resultLen - 1].scope == token.scope) {
                if(token.scope == "text" && result[resultLen - 1].ctx != token.ctx){
                    result[resultLen++] = token
                }else{
                    result[resultLen - 1].value += "\n" + token.value
                }
            } else {
                result[resultLen++] = token
            }
            
        }

        return result
    }


}