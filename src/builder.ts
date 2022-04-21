import { Tokenizer, TokenResult } from './tokenizer'
import { readFileSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { SourceNode, CodeWithSourceMap, SourceMapConsumer, NullablePosition } from 'source-map'
import { IGrammar } from 'vscode-textmate'
import { escapeQuotes } from './utils'

interface Tree {
    type: string,
    loc: Loc,
    children: Array<Token | IncBlock>
}

enum Scopes {
    PlainText = "plain.text.exp",
    InlineStart = "inline.begin.exp",
    InlineEnd = "inline.end.exp",
    BlockStart = "block.begin.exp",
    BlockEnd = "block.end.exp",
    IncludeStart = "include.begin.exp",
    IncludeEnd = "include.end.exp"
}

interface Token {
    loc: Loc,
    value: string
}

interface IncBlock {
    type: "include",
    loc: Loc,
    args: string[]
}

interface Pos {
    line: number,
    column: number
}

interface Loc {
    start: Pos,
    end: Pos
}

interface ICache {
    source: string,
    map: SourceNode
}

export default class Builder {
    /**
     * @property the grammar to use with tokenizer
     */
    protected grammar: IGrammar | null = null
    /**
     * @property the tokenizer used to tokenize entries
     */
    protected tokenizer = new Tokenizer()
    /**
     * @property the particular strategy to get view path ( as _settings.getView with express.js)
     */
    private _resolveIncludePath?: (file: string) => string
    /**
     * @property the cache store, to save parsed view and get it when asked in another place in the same or included view
     */
    protected sourceCaches: ICache[] = []
    /**
     * @property a store for inclusions mapping
     */
    public includeMap: { source: string, included: string, line: number, column: number, first: SourceNode, last: SourceNode }[] = []
    /**
     * @property a store for recording include errors
     */
    public includeErrors: { source: string, error: Error, line: number, column: number, node: SourceNode }[] = []

    constructor(resolveIncludePath?: (file: string) => string) {
        this._resolveIncludePath = resolveIncludePath
    }

    /**
     * wait until the builder is ready 
     */
    public async wait(): Promise<void> {
        this.grammar = await this.tokenizer.getGrammar("source.exp.lang")
    }

    /**
     * retrive the include source tarce for a genarated position
     * 
     * @param {string} target the included source
     * @param {number} line the base target generated line
     * @param {number} column the base target genareted column
     * @param {SourceMapConsumer} consumer the source-map consumer for generated map
     * @param {Array<string>} traces an array of source trace as `source:line:column`
     * @returns {Array<string>} the new trace array
     */
    getIncludeTraces(target: string, line: number, column: number, consumer: SourceMapConsumer, traces: string[] = []): string[] {
        let includes = this.includeMap.filter(({ included }) => included === target)
        let iids: number[] = []
        
        let include = includes.filter(({ source, first, last }, id) => {
            let start = this.walkPosition(first, consumer)[id]
            let stop = this.walkPosition(last, consumer, false)[id]
          
            if ((start.line! <= line && line <= stop.line!)){
                if(start.line === stop.line){
                    if(start.column! <= column && column <= stop.lastColumn!){
                        iids.push(id)
                        return true
                    }
                }
                if(column <= stop.lastColumn!) {
                    iids.push(id)
                    return true
                }
                
            }
            return false
        })[0]
        let iid = iids[0]

        if (!include) return traces
        traces.push(`${include.source}:${include.line}:${include.column}`)

        let start = this.walkPosition(include.first, consumer)[iid]
        return this.getIncludeTraces(include.source, start.line!, start.column!, consumer, traces)
    }

    /**
     * traverse node to get it's corrects genarated positions
     * 
     * @param {SourceNode} node the target node
     * @param {SourceMapConsumer} consumer the sourcemap consummer
     * @param {boolean|undefined} first whether we will traverse the first or last children
     * @returns {Array<NullablePosition>} the genarated positions array
     */
    walkPosition(node: SourceNode, consumer: SourceMapConsumer, first: boolean | undefined = true): NullablePosition[] {
        let pos = consumer.allGeneratedPositionsFor(node)
        if (pos.length === 0 && node.children.length > 0) {
            return this.walkPosition(first ? node.children[0] : node.children.slice(-1)[0], consumer)
        }
        return pos
    }

    /**
     * the place to tokenize and transform source code and generate the SourceNode
     * 
     * @param {string} content the code to parse
     * @param {string} source  the source filepath
     * @returns {SourceNode} the final sourcenode
     */
    protected parse(content: string, source: string): SourceNode {
        let tokens = this.tokenizer.tokenize(content, this.grammar!)

        let tree = this.walk(tokens)

        return new SourceNode(null, null, source, tree.map(t => this.compile(t, source)))
    }

    /**
     * walk through the TokenResult array to transform it to a tree array
     * for compilation 
     * 
     * @param {Array<TokenResult>} tokens  the tokens to transform 
     * @returns {Array<Tree>} the tree ready for the compilation
     */
    protected walk(tokens: TokenResult[]): Tree[] {
        let tree: Tree[] = []
        let index = 0
        while (index < tokens.length) {
            let token = tokens[index++]
            if (token?.scope.split(" ").includes(Scopes.BlockStart)) {
                let block: Array<Token | IncBlock> = []
                let start = token.start
                while (!!(token = tokens[index++]) && !token.scope.split(" ").includes(Scopes.BlockEnd)) {
                    while (token.scope.split(" ").includes(Scopes.IncludeStart)) {
                        let params = ""
                        let start = token.start
                        while (!!(token = tokens[index++]) && !token.scope.split(" ").includes(Scopes.IncludeEnd)) {
                            params += token.value
                        }
                        block.push({
                            type: "include",
                            loc: { start, end: token?.end || tokens.slice(-1)[0].end },
                            args: params.split(",")
                        })
                        token = tokens[index++]
                    }
                    block.push({
                        value: token.value,
                        loc: {
                            start: token.start,
                            end: token.end
                        }
                    })
                }
                tree.push({
                    type: "block",
                    loc: { start, end: token?.end || tokens.slice(-1)[0].end },
                    children: block
                })
            }
            if (token?.scope.split(" ").includes(Scopes.InlineStart)) {
                let block: Token[] = []
                let start = token.start
                while (!!(token = tokens[index++]) && !token.scope.split(" ").includes(Scopes.InlineEnd)) {
                    block.push({
                        value: token.value,
                        loc: {
                            start: token.start,
                            end: token.end
                        }
                    })
                }
                tree.push({
                    type: "inline",
                    loc: { start, end: token?.end || tokens.slice(-1)[0].end },
                    children: block
                })
            }
            if (token?.scope.split(" ").includes(Scopes.PlainText)) {
                tree.push({
                    type: "text",
                    loc: {
                        start: token.start,
                        end: token.end
                    },
                    children: [{
                        value: token.value,
                        loc: {
                            start: token.start,
                            end: token.end
                        }
                    }]
                })
            }
        }
        return tree
    }

    /**
     * get the cached SourceNode for a given source if exists 
     * 
     * @param {string} source  the target source 
     * @returns {ICache|undefined} the cached SourceNode or undefined 
     */
    protected getCachedSource(source: string): ICache | undefined {
        return this.sourceCaches.filter(cache => cache.source === source)[0]
    }

    /**
     * resolve the included file (view) pathe
     * 
     * @param {string} filePath  the relative view path
     * @param {string} from  the absolute parent view path
     * @returns {string} the absolute view path
     */
    private resolveIncludePath(filePath: string, from: string): string {
        filePath = filePath.replace(/\.exp$/, '')
        if (this._resolveIncludePath) return this._resolveIncludePath(filePath)

        return resolve(dirname(from), filePath + ".exp")
    }

    /**
     * include the content of a view in another view
     * 
     * @param {string} filePath  the relative path to the view to include 
     * @param {string} from  the absolute path to the parent view
     * @returns {SourceNode} the parsed result of the included view content
     */
    private include(filePath: string, from: string): SourceNode {
        let file = this.resolveIncludePath(filePath, from)
        let cached = this.getCachedSource(file)
        let map: SourceNode
        if (cached) {
            map = cached.map
        } else {
            let content = readFileSync(file, "utf-8")

            map = this.parse(content, file)

            this.sourceCaches.push({
                source: file,
                map
            })
        }

        return map
    }

    /**
     * compile the tokens tree array into a SourceNode to modify it and conserve a sourceMap 
     * for debugging purposes 
     * 
     * @param {Tree|Token|IncBlock} node  the node to compile
     * @param {string} source  the source filePath 
     * @returns {SourceNode} the compiled SourceNode 
     */
    protected compile(node: Tree | Token | IncBlock, source: string): SourceNode {
        if ((node as Tree).children && (node as Tree).type === "block") {
            node = node as Tree
            return new SourceNode(node.loc.start.line + 1, node.loc.start.column + 1, source, node.children.map(child => this.compile(child, source)))
        }

        if ((node as Tree).children && (node as Tree).type === "inline") {
            node = node as Tree
            return new SourceNode(node.loc.start.line + 1, node.loc.start.column + 1, source, [";write(", ...node.children.map(child => this.compile(child, source)), ");"])
        }

        if ((node as Tree).children && (node as Tree).type === "text") {
            node = node as Tree
            return new SourceNode(node.loc.start.line + 1, node.loc.start.column + 1, source, `;write("${escapeQuotes((node.children[0] as Token).value).split(/\r\n|\n/g).join("\\n")}");`)
        }

        if ((node as IncBlock).type && (node as IncBlock).type === "include") {
            node = node as IncBlock
            try {
                let file = join(...node.args.map(eval))

                let iNode = this.include(file, source)
                this.includeMap.push({
                    source,
                    included: this.resolveIncludePath(file, source),
                    line: node.loc.start.line + 1,
                    column: node.loc.start.column + 1,
                    first: iNode.children[0],
                    last: this.getLast(iNode)
                })

                return new SourceNode(node.loc.start.line + 1, node.loc.start.column + 1, source, iNode)
            } catch (e) {
                let iNode = new SourceNode(node.loc.start.line + 1, node.loc.start.column + 1, source, " ")
                this.includeErrors.push({
                    source,
                    line: node.loc.start.line + 1,
                    column: node.loc.start.column + 1,
                    node: iNode,
                    error: e as Error
                })
                return iNode
            }
        }

        node = node as Token
        return new SourceNode(node.loc.start.line + 1, node.loc.start.column + 1, source, node.value)
    }

    /**
     * get the last SourceNode child of a source node
     * 
     * @param {SourceNode} node the target source node
     * @returns {SourceNode} the last source node or the target source node
     */
    getLast(node: SourceNode): SourceNode {
        if (node.children?.length > 0) {
            for (let i = node.children.length; i > 0; i--) {
                let child = node.children[i - 1]
                if (child instanceof SourceNode) return this.getLast(child)
            }
            return node
        }
        return node
    }

    /**
     * build a source file and retur a code with sourceMap 
     * 
     * @param {string} content  the code to build
     * @param {string} source  the source file path
     * @param {string} out  the optional source generated file name
     * @returns {CodeWithSourceMap} 
     */
    public build(content: string, source: string, out: string = "build:///main.js"): CodeWithSourceMap {

        let sourceNode = this.parse(content, source) as SourceNode

        return sourceNode.toStringWithSourceMap({
            file: out
        })
    }
}
