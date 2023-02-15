// (c) Mark Howe, 15th February 2023 between 10:30am and 2:30pm with a break for lunch

// Known limitations
// - only tested on one MD file!!!
// - needs book name mapping for all books
// - turns "verse, verse" into "verse-verse" - need to add commas to Proskmma chapterVerses
// - ignores partial verses because there's no way to guess what someone thought part a was
// - currently replaces everything with ULT
// - needs to flag or fail on random markdown in a clean way
// - scanning all files and then collecting all quotes would be much much more efficient

// Also, I wouldn't do this in production
// Instead, I'd keep the notes with the placeholders and then
// drop in the latest quotes as the last step before publishing

const path = require('path');
const fse = require('fs-extra');
const xre = require('xregexp');
const {Proskomma} = require('proskomma');

// Evil regexes

// (Actually, they are an incredibly powerful and efficient solution to a lot of text-based issue
//  but haters gonna hate...)

const quotationRE = xre(/(^[ ]*(>[ ]+[^\n\r)]+)[\n\r]+)*(^[ ]*>[ ]+[^\n\r]+\((([I123] +)?[^ ().,;:?!\[]+ [1-9][0-9]*:[1-9][0-9]*[abcd]*([–-–-][1-9][0-9]*[abcd]*)?(,[ ]*[1-9][0-9]*[abcd]*(:[1-9][0-9]*[abcd]*)?)*)( ([A-Z]+))?\))/gm);
const snippetsRE = xre(/\*\*([^*])+\*\*/g);
const bookReplaceRE = /\s*[0-9]+:.*/;
const notBookReplaceRE = /^([1-6] )?\S+\s/;
const placeholderQuotedRE = /'([^']+)'/g;
const placeholderRE = /<!-- SCRIPTURE [^>]+>/g;

// Get original markdown

// We need a string for the regexes to work on

const inPath = path.resolve(process.argv[2]);
const md = fse.readFileSync(inPath).toString();

console.log("ORIGINAL MARKDOWN")
console.log(md);
console.log("\n\n############################\n\n")

// Extract quotes, make placeholders

// Placeholders look like this:
// <!-- SCRIPTURE 'Psalm 78:52' 'ULT' 'sheep' 'flock' -->

// From here on we're storing various things in arrays, all of which
// happen to have the same length. For a module I'd build a more interesting
// data structure

// We do the regexing in several bites

// We don't try to fix the randomness in book names here

// Here and elsewhere we use a common JS idiom to dedupe arrays using sets.

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

// The 'return text with side-effect' should probably not go into production
// but it is kinda cool.

let repN = 0;
const placeholderN = str => placeholders[repN++]
let mmd = xre.replace(md, quotationRE, placeholderN);
console.log("# Placeholders in situ #");
console.log(mmd);

// Normalize scripture references

// I produced this by printing out the value of the set 'books'
// In French this will be a long list because of n ways to use accents

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

// Loading USFM is the slowest thing about Proskomma
// That's because it does a lot of processing at parse time
// Also, uW USFM is the worst case because of the embedded alignment information
// In production I'd first make a succinct representation of the whole translation
// (or, preferably, get one from Diegesis)

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

// In this case we seem to want plain text by paragraph, which we get via blocks
// of the main sequence (ie the bits God wrote).

// There are several ways to do cv in Proskomma - the query includes a second option

// Proskomma uses linear search because indexed burn memory. In production I'd probably
// collect all the bcvs needed and then collect them all in one sweep of all documents
// which would be orders of magnitude faster for a large number of references.

console.log(`# Finding replacement text for references #`);
const replacementTexts = [];
for (const ref of normalizedReferences) {
    if (ref.includes('?')) {
        throw new Error(`Cannot look up reference '${ref}' - do you need to add more bookCode normalizing?`);
    }
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

// The current code will only highlight each snippet once per verse

let replacementMDs = [];
for (let n=0; n<replacementTexts.length; n++) {
    let replacement = replacementTexts[n];
    const placeholder = placeholders[n];
    const placeholderQuotedBits = xre.match(placeholder, placeholderQuotedRE)
        .map(b => b.replace(/'/g, ""));
    const source = placeholderQuotedBits[1];
    const snippets = placeholderQuotedBits.slice(2);
    for (const snippet of snippets) {
        replacement = replacement.map(r => r.replace(`${snippet}`, `**${snippet}**`));
    }
    const replacementMD = `${replacement.map(p => `> ${p}`).join('\n')} (${rawReferences[n]} ${source.replace(/'/g, "")})\n`;
    replacementMDs.push(replacementMD);
    console.log(replacementMD);
}

// Drop text back into markdown to replace placeholders

// Same side-effect trick as above

console.log(`# Replace placeholders with new text #`);
repN = 0;
const replacementMDN = str => replacementMDs[repN++]
let md2 = xre.replace(mmd, placeholderRE, replacementMDN);
console.log(md2);
