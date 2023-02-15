const path = require('path');
const fse = require('fs-extra');
const xre = require('xregexp');
const {Proskomma} = require('proskomma');

// Evil regexes
const quotationRE = xre(/(^[ ]*(>[ ]+[^\n\r)]+)[\n\r]+)*(^[ ]*>[ ]+[^\n\r]+\((([I123] +)?[^ ().,;:?!\[]+ [1-9][0-9]*:[1-9][0-9]*[abcd]*([–-–-][1-9][0-9]*[abcd]*)?(,[ ]*[1-9][0-9]*[abcd]*(:[1-9][0-9]*[abcd]*)?)*)( ([A-Z]+))?\))/gm);
const snippetsRE = xre(/\*\*([^*])+\*\*/g);
const bookReplaceRE = /\s*[0-9]+:.*/;
const notBookReplaceRE = /^([1-6] )?\S+\s/;
const placeholderRE = /<!-- SCRIPTURE [^>]+>/g;

// Get original markdown
const inPath = path.resolve(process.argv[2]);
const md = fse.readFileSync(inPath).toString();

console.log("ORIGINAL MARKDOWN")
console.log(md);
console.log("\n\n############################\n\n")

// Extract quotes, make placeholders
let placeholders = [];
let rawReferences = [];
let books = new Set([]);

for (const match of xre.match(md, quotationRE)) { // capture whole quote plus reference as a single string
    console.log('# Whole quotation');
    console.log(match);
    const matchParts = xre.exec(match, quotationRE);
    const reference = matchParts[4];
    rawReferences.push(reference);
    const book = reference.replace(bookReplaceRE, "");
    books.add(book);
    const source = matchParts[10];
    console.log(`\n# Reference:   '${reference}'`);
    console.log(`# Source:      '${source}'`);
    let snippets = xre.match(matchParts[0], snippetsRE)
        .map(s => s.replace(/\*/g, ""))
        .map(s => `'${s}'`);
    snippets = Array.from(new Set(snippets));
    console.log(`# Snippets:    ${snippets.join(' ')}`);
    const placeholder = `<!-- SCRIPTURE '${reference}' '${source}' ${snippets.join(' ')} -->`;
    console.log(`# Placeholder: ${placeholder}`);
    placeholders.push(placeholder);
    console.log("\n-----------\n");
}

// Replace quotes with placeholders
let repN = 0;
const placeholderN = str => placeholders[repN++]
let mmd = xre.replace(md, quotationRE, placeholderN);
console.log("# Placeholders in situ #");
console.log(mmd);

// Normalize scripture references

const bookCodes = {
    '2 Samuel': "2SA",
    'Psalm': "PSA",
    'Lamentations': "LAM",
    'Proverbs': "PRO",
    'Habakkuk': "HAB",
    'Hosea': "HOS",
    'Isaiah': "ISA",
    'Psalms': "PSA",
    '1 Peter': "1PE",
    'Matthew': "MAT",
    'Jeremiah': "JER"
};

const normalizedReferences = rawReferences
    .map(r => `${bookCodes[r.replace(bookReplaceRE, "")] || `??${r}??`} ${r.replace(notBookReplaceRE, "")}`)
    .map(r => r.replace(", ", "-"))
    .map(r => r.replace(/[abc]$/, ""));
console.log("# Normalize references #");
console.log(normalizedReferences.join("\n"));

// Load required USFM books into Proskomma
const pk = new Proskomma();
const uniqueBooks = Array.from(new Set(Object.values(bookCodes)));
console.log("# Unique books #");
console.log(uniqueBooks.join('\n'));
for (const book of uniqueBooks) {
    const bookPath = path.resolve('test', 'test_data', 'scripture', 'ult', `${book}.usfm`);
    if (!fse.pathExists(bookPath)) {
        throw new Error(`No USFM for ${book} at ${bookPath}`);
    }
    console.log(`# Loading USFM for ${book} #`)
    pk.importDocument({
            lang: "eng",
            abbr: "ult",
        },
        'usfm',
        fse.readFileSync(bookPath).toString(),
    )
}

// Find replacement text by reference
console.log(`# Finding replacement text for references #`);
const replacementTexts = [];
for (const ref of normalizedReferences) {
    const query = `{
      docSet(id: "eng_ult") {
        document(bookCode: """${ref.replace(bookReplaceRE, "")}""") {
          cv(chapterVerses: """${ref.replace(notBookReplaceRE, "")}""") {
            text(normalizeSpace: true)
          }
          mainSequence {
            blocks(withScriptureCV: """${ref.replace(notBookReplaceRE, "")}""") {
              tokens(withScriptureCV: """${ref.replace(notBookReplaceRE, "")}""") {
                payload
              }
            }
          }
        }
      }
    }`
    // console.log(query);
    const result = pk.gqlQuerySync(query);
    if (result.error) {
        console.log(`Error from Proskomma query ${query}: ${JSON.stringify(result.error)}`);
        process.exit(1);
    }
    // const verseAsText = result.data.docSet.document.cv
    //     .map(v => v.text)
    //    .join('');
    const verseAsParas = result.data.docSet.document.mainSequence.blocks
        .map(
            b => b.tokens
                .map(i => i.payload)
                .join('')
                .replace(/\s/g, " ")
                .trim()
        )
        .filter(b => b.length > 0);
    console.log(verseAsParas);
    replacementTexts.push(verseAsParas);
}

// Build text to drop back into markdown
let replacementMDs = [];
for (let n=0; n<replacementTexts.length; n++) {
    const replacementMD = `${replacementTexts[n].map(p => `> ${p}`).join('\n')} (${rawReferences[n]})\n`;
    replacementMDs.push(replacementMD);
    console.log(replacementMD);
}

// Drop text back into markdown to replace placeholders
console.log(`# Replace placeholders with new text #`);
repN = 0;
const replacementMDN = str => replacementMDs[repN++]
let md2 = xre.replace(mmd, placeholderRE, replacementMDN);
console.log(md2);
