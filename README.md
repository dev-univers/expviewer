# expviewer

Expviewer is a view engineer for express application that use a litle php like syntax to 
describe view with some interesting features

# installation

```sh
npm install expviewer
```

# first view
A sample preview in vscode

<img src="./test/expvscode.png" alt="exp vscode preview" />

# core description

The view basically use a classic html syntax but enable to use two tags to embed a javascript code that will be executed in a nodejs context .
Those are: 

* `<?exp /* block code */ ?>` to describe a script that will run in the context an eventually 
write something inside the final generated response

* `<?e= /* inline expression */ ?>` for an expression that result will append inside the finale 
response

# basic documentation

The embedded script is executed in a nodejs context, so we can use all the basic javascript syntax an functionality inside it, but we can also use the nodejs's require api to require node modules, js an json files inside the embedded script in your views.

Additionally to the basic javascript api, there are some build-in constants and functions that you can use in your exp script , they are :

* `__view: string`: a string containing the current view's absolute path 

* `__filename: string`: the absolute path to the script that required the expviewer module
    * app.js
    ```js
    const exp = require("expviewer")
    // ...
    app.engine("exp", exp)
    app.set("view enginer", "exp")
    // ...
    app.get("/test", (req, res)=>{
        res.render("view")
    })
    ```
    * view.exp
    ```html
    <span> <?e= __filename ?> </span>
    ```
    the result will be `<span><!-- path/to/app.js --> </span>`

* `__dirname: string`: the folder in which the requirer of expviewer is located

* `__module: string`: the relative path from execution context to the requirer file , useful to require a local script or json inside the view 
    * paths description
    ```
    src
         >app.js
         ...
    models
         index.js
         ...
    ```
    * require the models/index.js from view.exp
    ```js
    <?exp 
        const models = require(__module+"/../models") // the requirer here is app.js
    ?>
    ```

* `print: (value: string|any)=>void`: a build in function used to write something inside the response that will be generated

* `println: (value: string|any)=>void`: do the same job than `print` but with a line break ( just a `\n` not `<br />` )

* `write: (value: string|any)=>void`: alias for `print`

* `writeHtml: (value: string|any)=>void`: alias for `print` which escape html specials characters before printing
    ```html
    <pre>
        <?exp
            writeHtml(fs.readFileSync(__filename, "utf8"))
        ?>
    </pre>
    ```

* `writeJs: (value: string|any)=>void`: alias for `print` that format string to prevent error in javascript context before printing
    ```html
    <script>
        let code = "<?exp
            writeJs(fs.readFileSync(__filename, "utf8"))
        ?>"
    </script>
    ```

* `escapeHtml: (value: string)=> string`: escape html's special character and return the result

* `escapeJs: (value: string)=> string`: escape string to avoid error in javascript context

> using the render option, you can add or override some globals variables initially declared in the execution context

* route.js
    ```js
        const products = require("../products")
        app.get("/products", (req, res)=>{
            // ...
            res.render("products", {
                //override __filename and __dirname
                __filename,
                __dirname,
                title: " our products",
                products
            })
        })
    ```
* products.exp
    ```html
    <!-- ... -->
    <head>
        <title><?e= title ?</title>
    </head>
    <body>
        <!-- ... -->
        <?exp 
            products.forEach(prod=>{
                ?>
                <!-- show product some how -->
                <?exp
            })
        ?>
        <script>
            // debug product
            console.log(<?e= JSON.stringify(products) ?>)
        </script>
    </body>
    ```

# Limitations 

Because the view is read an evaluated synchronously an from one to end and exit directly when the last line is evaluated, it is not actually possible to run an asynchronous code in the exp script (with usage of callback functions) but it is possible to use the `await` keyword directly in the main scope (no need to be in an `async` function, but just in the main scope if you want to use await in a function , this still need the function to be an async function); considering this, you could change your functions with callback to promise then await when required in the main scope
```js
<?exp
    const util = require("util")
    const fs = require("fs")

    const readfile = util.promisify(fs.readFile)

    // or

    function readFile2(file, encoding = "utf8"){
        return new Promise((resolve, reject)=>{
            fs.readFile(file, encoding, (err, val)=>{
                if(err){
                    reject(err)
                    break
                }
                resolve(val)
            })
        })
    }
    
    print(await readFile(__filename, "utf8"))
    print(await readFile2(__filename))
?>
```
But because of using `await`, if the treatment take to mush time, this will take effect on your server's response time but if you well thing your script, this could be no problem. You must eventually do some work ahead and parse the result to the render options
```js
app.get("/code", (req, res)=>{
    fs.readFile("file", "utf8", code=>{
        res.render("code", {code})
    })
})
```
