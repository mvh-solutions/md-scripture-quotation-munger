const path = require('path');
const fse = require('fs-extra');
const xre = require('xregexp');

// Get original markdown
const inPath = path.resolve(process.argv[2]);
const md = fse.readFileSync(inPath).toString();

console.log("ORIGINAL MARKDOWN")
console.log(md);
console.log("\n\n############################\n\n")

// Extract quotes for analysis
const quotationRE = xre(/(^[ ]*(>[ ]+[^\n\r)]+)[\n\r]+)*(^[ ]*>[ ]+[^\n\r]+\((([I123] +)?[^ ().,;:?!\[]+ [1-9][0-9]*:[1-9][0-9]*[abcd]*([–-–-][1-9][0-9]*[abcd]*)?(,[ ]*[1-9][0-9]*[abcd]*(:[1-9][0-9]*[abcd]*)?)*)( ([A-Z]+))?\))/gm);
// const quotationRE = xre("", "mg");

for (const match of xre.match(md, quotationRE)) {
    console.log(match);
    console.log("\n-----------\n");
}
