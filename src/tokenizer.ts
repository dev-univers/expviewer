import { readFileSync, promises } from "fs"
import { resolve } from "path"
import { loadWASM, OnigScanner, OnigString } from "vscode-oniguruma"
import { IGrammar, INITIAL, parseRawGrammar, Registry, StackElement } from "vscode-textmate"
import { Grammars } from "./utils"

export interface TokenResult {
    value: string,
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
                    scope: getState(tokenScope)
                }
            }
        }
        return { tokens: result, ruleStack}
    }
    /**
     * tokenize a mutiline string to an array of tokens
     *
     * @param {string} code multiline ( or array of ) string to tokenize
     * @returns {Promise<TokenResult[]>}
     */
    async tokenize(code: string|string[]): Promise<TokenResult[]> {
        if(!Array.isArray(code)) code = code.split(/\r\n|\n/)

        let state: StackElement|undefined,
            grammar = await this.grammar,
            resultLen = 0,
            result: TokenResult[] = [],
            _li = 0

        for(let li in code){

            let line = code[li]

            let {tokens, ruleStack} = this.tokenizeLine(grammar!!, line, state)

            for(let token of tokens){

                if(resultLen == 0){
                    result[resultLen++] = token
                }else if(result[resultLen-1].scope == token.scope){
                    result[resultLen-1].value += (_li == Number(li)? "" : "\n") + token.value
                }else{
                    result[resultLen++] = token
                }
                _li = Number(li)
            }

            state = ruleStack
        }


        return result
    }

}