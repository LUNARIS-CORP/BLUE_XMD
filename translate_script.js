const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const translate = require('translate-google-api');

async function translateText(text, retries = 5) {
    if (!text || text.trim() === '') return text;
    // Prevent translating some technical things (like URLs, paths, or pure symbols)
    if (/^(https?:\/\/|[A-Za-z0-9_]+\.[A-Za-z0-9_]+$|^[^a-zA-Z]+$)/.test(text)) return text;
    
    for (let i = 0; i < retries; i++) {
        try {
            const res = await translate(text, { to: 'fr' });
            await new Promise(r => setTimeout(r, 1500)); // 1.5s delay to avoid rate limit
            return res[0];
        } catch (e) {
            console.error(`Error translating "${text}":`, e.message);
            if (e.message.includes('429')) {
                console.log('Rate limit hit. Waiting 15 seconds...');
                await new Promise(r => setTimeout(r, 15000));
            } else {
                return text;
            }
        }
    }
    return text;
}

async function translateTemplateLiteral(node) {
    let combinedString = "";
    let quasis = node.quasis;
    
    // Combine with placeholders
    for (let i = 0; i < quasis.length; i++) {
        combinedString += quasis[i].value.raw;
        if (i < quasis.length - 1) {
            combinedString += `___${i}___`;
        }
    }
    
    if (combinedString.trim() === '') return;

    let translated = await translateText(combinedString);
    
    // Reconstruct
    let newQuasis = [];
    let parts = translated.split(/___\d+___/);
    
    // If splitting changed the number of parts due to translation corruption, fallback
    if (parts.length !== quasis.length) {
        console.warn('Fallback on template literal:', combinedString);
        return; 
    }

    for (let i = 0; i < parts.length; i++) {
        newQuasis.push(t.templateElement({ raw: parts[i], cooked: parts[i] }, i === parts.length - 1));
    }
    
    node.quasis = newQuasis;
}

async function processFile(filePath) {
    console.log('Processing:', filePath);
    const code = fs.readFileSync(filePath, 'utf-8');
    let ast;
    try {
        ast = parser.parse(code, {
            sourceType: "module",
            plugins: ["jsx"]
        });
    } catch (e) {
        console.error('Parse error on', filePath, e);
        return;
    }

    const stringsToTranslate = [];
    const templatesToTranslate = [];

    // First pass: collect strings
    traverse(ast, {
        ObjectProperty(path) {
            const key = path.node.key;
            const isTextOrCaption = (t.isIdentifier(key) && ['text', 'caption', 'footer', 'title', 'body', 'header'].includes(key.name)) || 
                                    (t.isStringLiteral(key) && ['text', 'caption', 'footer', 'title', 'body', 'header'].includes(key.value));
            if (isTextOrCaption) {
                if (t.isStringLiteral(path.node.value)) {
                    stringsToTranslate.push(path.node.value);
                } else if (t.isTemplateLiteral(path.node.value)) {
                    templatesToTranslate.push(path.node.value);
                }
            }
        },
        CallExpression(path) {
            const callee = path.node.callee;
            const isReply = (t.isIdentifier(callee) && callee.name === 'reply') ||
                            (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && (callee.property.name === 'reply' || callee.property.name === 'sendMessage'));
            
            if (isReply) {
                if (t.isIdentifier(callee.property) && callee.property.name === 'sendMessage') {
                   // handled in object property
                } else {
                    const arg = path.node.arguments[0];
                    if (t.isStringLiteral(arg)) {
                        stringsToTranslate.push(arg);
                    } else if (t.isTemplateLiteral(arg)) {
                        templatesToTranslate.push(arg);
                    }
                }
            }
        },
        VariableDeclarator(path) {
            if (t.isIdentifier(path.node.id) && (path.node.id.name === 'menu' || path.node.id.name.toLowerCase().includes('message'))) {
                if (t.isStringLiteral(path.node.init)) {
                    stringsToTranslate.push(path.node.init);
                } else if (t.isTemplateLiteral(path.node.init)) {
                    templatesToTranslate.push(path.node.init);
                }
            }
        }
    });

    // Translate collected strings
    for (const node of stringsToTranslate) {
        if (!node._translated) {
            let orig = node.value;
            node.value = await translateText(node.value);
            node._translated = true;
            if (orig !== node.value) console.log(`"${orig}" -> "${node.value}"`);
        }
    }

    for (const node of templatesToTranslate) {
        if (!node._translated) {
            await translateTemplateLiteral(node);
            node._translated = true;
        }
    }

    const output = generate(ast, { retainLines: true }, code);
    fs.writeFileSync(filePath, output.code);
    console.log('Saved:', filePath);
}

async function run() {
    const args = process.argv.slice(2);
    for (const file of args) {
        await processFile(file);
    }
}

run();
