import { readFileSync, promises } from "fs"
import { resolve } from "path"
import { loadWASM, OnigScanner, OnigString } from "vscode-oniguruma"
import { IGrammar, INITIAL, parseRawGrammar, Registry, StackElement } from "vscode-textmate"
import { Grammars } from "./utils"

export interface TokenResult {
    value: string,
    scope: string, 
    start: Pos, 
    end: Pos
}

export interface LineToken {
    tokens: TokenResult[],
    ruleStack: StackElement
} 

export interface Pos {
    line: number, 
    column: number
}

export class Tokenizer {
    /**
     * @property the grammar scope name
     */
    private scopeName = "source.exp.lang"
    /**
     * @property the vscode-textmate registry for grammars
     */
    private registry: Registry 
    /**
     * @property the tokenization grammar
     */
    grammar: IGrammar|null = null

    constructor(){
        
        const wasmBin = readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm")).buffer;
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
    /**
     * retrive a textmate grammar
     * 
     * @param {string|undefined} scopeName the optional scope name
     */
    async getGrammar(scopeName?: string){
        return await this.registry.loadGrammar(scopeName || this.scopeName)
    }

    /**
     * help to tokenize an one-line string with a desired grammar
     * 
     * @param {IGrammar} grammar the grammar that will be used for tokenize line
     * @param {string} line the one-line string to tokenize
     * @param {StackElement} state the previous line tokenization stack
     * @returns {LineToken}
     */
    tokenizeLine(grammar: IGrammar, line: string, lino: number, state: StackElement = INITIAL): LineToken{
        let resultLen = 0,
            result: TokenResult[] = [] ,
            {tokens, ruleStack} = grammar.tokenizeLine(line, state),
            lastScopes: string|null = null
        
        for(let j =0 ,lenJ = tokens.length; j<lenJ; j++){
            let {startIndex, scopes, endIndex} = tokens[j],
                value = line.substring(startIndex, endIndex),
                tokenScope = scopes.join(' ')
            
            if(lastScopes == tokenScope){
                let pi = resultLen - 1
                result[pi].value += value
                result[pi].end.column = endIndex
            }else{
                lastScopes = tokenScope
                result[resultLen++] = {
                    value,
                    scope: tokenScope, 
                    start: {
                        line: lino, 
                        column: startIndex
                    }, 
                    end: {
                        line: lino, 
                        column: endIndex
                    }
                }
            }
        }
        return { tokens: result, ruleStack}
    }
    
    /**
     * tokenize a mutiline string to an array of tokens
     *
     * @param {string} code multiline ( or array of ) string to tokenize
     * @returns {TokenResult[]}
     */
    tokenize(code: string|string[], grammar: IGrammar): TokenResult[] {
        if(!Array.isArray(code)) code = code.split(/\r\n|\n/)

        let state: StackElement|undefined,
            resultLen = 0,
            result: TokenResult[] = [],
            _li = 0

        for(let li in code){

            let line = code[li]
            let lino = Number(li)

            let {tokens, ruleStack} = this.tokenizeLine(grammar!!, line, lino, state)

            for(let token of tokens){

                if(resultLen == 0){
                    token.start.line=lino
                    token.end.line=lino
                    result[resultLen++] = token
                }else if(result[resultLen-1].scope == token.scope){
                    let pi = resultLen - 1
                    if(result[pi].end.line !== lino ){
                        result[pi].value += '\n'+token.value
                        result[pi].end.line = lino 
                        result[pi].end.column = token.end.column
                    } else {
                        result[pi].value += token.value
                        result[pi].end.column = token.end.column
                    }
                    
                }else{
                    token.start.line=lino
                    token.end.line=lino
                    result[resultLen++] = token
                    if(token.end.column === line.length){
                        result[resultLen++] = {
                            start: {
                                line: lino, 
                                column: line.length
                            },
                            end: {
                                line: lino+1,
                                column: 0
                            },
                            scope: 'eol', 
                            value: '\n'
                        }
                    }
                }
                _li = Number(li)
            }

            state = ruleStack
        }

        return result
    }
    
} 
