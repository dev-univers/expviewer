import { resolve } from "path"
import expressor from ".."

function test(){

    expressor(resolve(__dirname, "../../test/test.exp"), console.log)
}

test()