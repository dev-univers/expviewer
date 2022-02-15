import express from "express";
import exp from "../";
// @ts-ignore
import request from "request";
import {readdirSync, writeFileSync} from "fs";
import path from "path";
import {Options, format} from "prettier";
import chai from "chai";
import cap from "chai-as-promised";
import {Context} from "vm";
import {Server} from "http";
import {Grammars} from "../utils";
import {execSync} from "child_process";
import {platform} from "os";

chai.use(cap);
chai.should();

const formatOptions: Options = {
    parser: "html",
    tabWidth: 2,
    useTabs: true,
};

const TEST_PORT = 28554

const testApp = express()
testApp.engine("exp", exp)
testApp.set("views", __dirname)
testApp.set("view engine", "exp")

let rid = 0

function remove(file: string){
    execSync((platform() == "win32"? "del /S ":"rm -r ")+path.resolve(__dirname, file))
}

function run(code: string, options: Context = {}) {
    writeFileSync(path.resolve(__dirname, "test.exp"), code);

    testApp.get("/test-"+rid, (req, res) => {
        res.render("test", options);
    });

    return new Promise((resolve, rejects) => {
        request("http://localhost:"+TEST_PORT+"/test-"+rid++, "GET", (error: any, response: any, body: string) => {
            remove("./test.exp")

            if(error) rejects(error)
            resolve(format(body, formatOptions));
        });
    });
}

let server: Server

describe("expviewer test", ()=>{
    before(()=>{
        server = testApp.listen(TEST_PORT)
    })
    after(()=>{
        server.close()
        rid = 0
    })
    describe("#tags", ()=>{

        it("should plain code walk", done => {
            run(`<h1> Hello World !</h1>`).should.eventually
                .equals(format(`<h1> Hello World !</h1>`, formatOptions)).notify(done)
        })

        it("should block code walk", done => {
            run(`<?exp
                let test = "Hello World !"
            ?>
            <h1> <?exp print(test) ?> </h1>`).should.eventually
                .equals(format(`<h1> Hello World ! </h1>`, formatOptions)).notify(done)
        })

        it("should inline code walk", done => {
            run(`<h1> <?e= "Hello World !" ?> </h1>`).should.eventually
                .equals(format(`<h1> Hello World ! </h1>`, formatOptions)).notify(done)
        })
    })

    describe("#globals", ()=>{
        it("should globals be ok", done=>{
            run(`<?exp
                let globals = {__dirname, __filename, __module, __view}
            ?>
            <div>
                <?exp
                    for(let i in globals){
                        ?>
                        <b> <?e= i ?> :</b> <?e= globals[i] ?>
                        <?exp
                    }
                ?>
            </div>`).should.eventually.equals(format(`<div>
                        <b> __dirname :</b> ${__dirname}
                        <b> __filename :</b> ${__filename}
                        <b> __module :</b> ./test/
                        <b> __view :</b> ${path.resolve(__dirname, "test.exp")}
                    </div>`, formatOptions)).notify(done)
        })

        it("should write well", done => {
            let code = `<div class="dome"> just a demo </div>`
            run(`<?exp
                print("<!-- just a to comment -->\\n")
                println("<!DOCTYPE html>")
            ?>
            <html>
            <head>
                <title> <?exp write(title) ?> </title>
            </head>
            <body>
                <pre><?exp writeHtml(code) ?></pre>
                <script>
                    console.log(<?exp writeJs(users) ?>)
                </script>
            </body>
            </html>`,{
                title: "demo",
                code: code,
                users:[
                    {id: 0, uname: "lucky"},
                    {id: 1, uname: "nems"}
                ]}).should.eventually.equals(format(`<!-- just a to comment -->
                <!DOCTYPE html>
                <html>
                <head>
                    <title> demo </title>
                </head>
                <body>
                    <pre>&lt;div class=&quot;dome&quot;&gt; just a demo &lt;/div&gt;</pre>
                    <script>
                        console.log([{"id": 0, "uname": "lucky"}, {"id": 1, "uname": "nems"}])
                    </script>
                </body>
                </html>`, formatOptions)).notify(done)
        })

    })

    describe("#nodejsApi", ()=>{

        it("should require internal", done=>{
            run(`<?exp
                let path = require("path")
            ?>
            <script>
                console.log(<?e= JSON.stringify({...path.win32, win32: undefined, posix: undefined}) ?>)
            </script>`).should.eventually
                .equals(format(`<script>
                    console.log(${JSON.stringify({...path.win32, win32: undefined, posix: undefined})})
                </script>`, formatOptions)).notify(done)
        })

        it("should require js file", done=>{
            run(`<?exp
                let {Grammars} = require(__module+"../utils")
            ?>
            <script>
                console.log(<?e= JSON.stringify(Grammars) ?>)
            </script>`).should.eventually
                .equals(format(`<script>
                    console.log(${JSON.stringify(Grammars)})
                </script>`, formatOptions)).notify(done)
        })

        it("should require json file", done=>{
            const users = [
                {id: 0, uname: "lucky"},
                {id: 1, uname: "nems"}
            ]
            writeFileSync(path.resolve(__dirname, "users.json"), JSON.stringify(users))
            after(()=>{
                remove("./users.json")
            })
            run(`<?exp
                let users = require(__module+"users")
            ?>
            <script>
                console.log(<?e= JSON.stringify(users) ?>)
            </script>`).should.eventually
                .equals(format(`<script>
                    console.log(${JSON.stringify(users)})
                </script>`, formatOptions)).notify(done)
        })

        it("should access process", done => {
            run(`<script>
                console.log(<?e= JSON.stringify(process.env) ?>)
            </script>`).should.eventually
                .equals(format(`<script>
                    console.log(${JSON.stringify(process.env)})
                </script>`, formatOptions)).notify(done)
        })
    })

    describe("#utils", ()=>{

        it("should use async", done=>{

            run(`<?exp
                let {promises} = require("fs")
                
                writeJs(await promises.readdir(__dirname))
            ?>`).should.eventually
                .equals(format(JSON.stringify(readdirSync(__dirname)), formatOptions)).notify(done)
        })

        it("should wait callback", done => {
            let code = "bonjour le monde !"
            writeFileSync(path.resolve(__dirname, "demo.txt"), code)
            after(()=>{
                remove("demo.txt")
            })

            run(`<?exp
                let fs = require("fs")
                let path = require("path")
                
                print(await (async _=>{
                    return new Promise((resolve, reject)=>{
                        fs.readFile(path.resolve(__dirname, "demo.txt"), "utf8", (err, dt)=>{
                            if(err) reject(err)
                            resolve(dt)
                        })
                    })
                })())
            ?>`).should.eventually
                .equals(format(code, formatOptions)).notify(done)
        })

        it("should escape html", done=>{
            let code = `<div class="test"> just for test </div>`
            run(`<pre><?e= escapeHtml(code) ?></pre>`, {code}).should.eventually
                .equals(format(`<pre>&lt;div class=&quot;test&quot;&gt; just for test &lt;/div&gt;</pre>`, formatOptions)).notify(done)
        })


    })

})
