import express from "express"
import { resolve } from "path"
import expressor from ".."

let app = express()
app.engine("exp", expressor)
app.set('views', resolve(__dirname, '../../test'))
app.set('view engine', 'exp')

app.get("/", (req: any, res: any)=>{

    res.render("test", {res})
})

app.listen(5000, ()=>console.log("test server is listening on http://localhost:5000"))