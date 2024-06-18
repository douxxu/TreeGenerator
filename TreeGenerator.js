#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const colors = require('colors');
const blessed = require('blessed');

(async () => {
    let clipboardy;
    try {
        const module = await import('clipboardy');
        clipboardy = module.default;
        console.log('[IMPORT] Clipboardy imported successfully.');
    } catch (error) {
        console.error('[IMPORT] Failed to import clipboardy:', error);
        process.exit(1);
    }

    let version = '';
    try {
        const packageJsonPath = path.resolve(__dirname, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        version = packageJson.version;
        console.log(`[PACKAGE] Loaded version from package.json: ${version}`);
    } catch (error) {
        console.error('[PACKAGE] Error while opening package.json:', error.message);
        process.exit(1);
    }

    const githubLink = 'https://github.com/douxxu/TreeGenerator';

    function generateTrees(rootPath) {
        console.log(`[GENERATOR] Generating trees for path: ${rootPath}`);
        console.time('generateTrees-1');

        let tree = '';
        let jsonTree = { path: rootPath, type: 'directory', children: [] };

        const generateTree = (dirPath, indent = '', parentNode = jsonTree) => {
            console.log(`[GENERATOR] Generating tree for directory: ${dirPath}`);
            console.time(`generateTree-${dirPath}`);

            let items;
            try {
                items = fs.readdirSync(dirPath);
            } catch (error) {
                console.error(`[GENERATOR] Error reading directory ${dirPath}:`, error.message);
                return;
            }

            items.forEach((item, index) => {
                const itemPath = path.join(dirPath, item);
                const isLastItem = index === items.length - 1;
                const branch = isLastItem ? '└── '.gray : '├── '.gray;
                const prefix = indent + branch;

                let coloredItem;
                try {
                    if (fs.statSync(itemPath).isDirectory()) {
                        coloredItem = colors.blue(item);
                    } else {
                        coloredItem = colors.green(item);
                    }
                } catch (error) {
                    console.error(`[GENERATOR] Error stating ${itemPath}:`, error.message);
                    return;
                }

                tree += prefix + coloredItem + '\n';

                const nextIndent = indent + (isLastItem ? '    ' : '│   '.gray);

                let newNode = { name: item };
                if (fs.statSync(itemPath).isDirectory()) {
                    newNode.children = [];
                    generateTree(itemPath, nextIndent, newNode);
                }

                parentNode.children.push(newNode);
            });

            console.timeEnd(`generateTree-${dirPath}`);
        };

        try {
            generateTree(rootPath);
        } catch (error) {
            console.error(`[GENERATOR] Error generating tree for ${rootPath}:`, error.message);
        }

        jsonTree = JSON.stringify(jsonTree, null, 2);

        console.timeEnd('generateTrees-1');
        console.log('[GENERATOR] Trees generated successfully.');

        return { tree, jsonTree, rootPath };
    }

    function main() {
        const inputPath = process.argv[2];
        console.log(`[INFO] Input path: ${inputPath}`);
        console.time('main');

        if (!inputPath) {
            console.error('[INFO] Usage: node index.js <path>'.red);
            process.exit(1);
        }

        if (!fs.existsSync(inputPath)) {
            console.error('[INFO] Error: The provided path does not exist.'.red);
            process.exit(1);
        }

        let stats;
        try {
            stats = fs.statSync(inputPath);
        } catch (error) {
            console.error(`[INFO] Error stating ${inputPath}:`, error.message);
            process.exit(1);
        }

        if (!stats.isDirectory()) {
            console.error('[INFO] Error: The provided path is not a directory.'.red);
            process.exit(1);
        }

        console.log(`[TREES] Starting to generate trees for path: ${inputPath}`);
        console.time('generateTrees');
        const { tree, jsonTree, rootPath } = generateTrees(inputPath);
        console.timeEnd('generateTrees');
        console.log('[TREES] Trees generated:', { treeLength: tree.length, jsonTreeLength: jsonTree.length });

        let currentDisplayMode = 'tree';

        console.time('screenCreation');
        const screen = blessed.screen({
            smartCSR: true,
            title: 'File Tree'
        });
        console.timeEnd('screenCreation');
        console.log('[SCREEN] Screen created.');

        console.time('boxCreation');
        let box = createBox(tree);
        console.timeEnd('boxCreation');
        console.log('[BOX] Initial box created.');

        console.time('pathBoxCreation');
        const pathBox = blessed.box({
            top: 0,
            left: 'center',
            width: '100%',
            height: 1,
            content: `TreeGenerator @${version} | Path: `.cyan + rootPath,
            style: {
                fg: 'white',
                bg: 'black'
            }
        });
        console.timeEnd('pathBoxCreation');
        console.log('[BOX] Path box created.');

        console.time('barCreation');
        const bar = blessed.box({
            bottom: 0,
            left: 0,
            width: '100%',
            height: 'shrink',
            content: '^Q: quit, ^C: copy tree to clipboard, ^V: toggle tree view',
            tags: true,
            style: {
                fg: 'white',
                bg: 'blue'
            }
        });
        console.timeEnd('barCreation');
        console.log('[BOX] Bar created.');

        console.time('screenAppend');
        screen.append(pathBox);
        screen.append(box);
        screen.append(bar);
        console.timeEnd('screenAppend');
        console.log('[BOX] Elements appended to screen.');

        console.time('screenKeyBinding');
        screen.key(['C-q'], function (ch, key) {
            console.log('Thanks for using TreeGenerator!');
            return process.exit(0);
        });
        console.timeEnd('screenKeyBinding');

        console.time('screenKeyBindingCopy');
        screen.key(['C-c'], async function (ch, key) {
            try {
                let contentToCopy = currentDisplayMode === 'tree' ? tree.replace(/\u001b\[.*?m/g, '') : jsonTree;
                contentToCopy += `\n\nMade with TreeGenerator@${version}`;
                await clipboardy.write(contentToCopy);
                bar.setContent('Content copied to clipboard.');
                screen.render();

                setTimeout(() => {
                    bar.setContent('^Q: quit, ^C: copy tree to clipboard, ^V: toggle tree view');
                    screen.render();
                }, 2000);

            } catch (error) {
                console.error('Error copying to clipboard:', error);
            }
        });
        console.timeEnd('screenKeyBindingCopy');

        console.time('screenKeyBindingToggle');
        screen.key(['C-v'], function (ch, key) {
            if (currentDisplayMode === 'tree') {
                currentDisplayMode = 'json';
                screen.remove(box);
                box = createBox(jsonTree);
                screen.append(box);
            } else {
                currentDisplayMode = 'tree';
                screen.remove(box);
                box = createBox(tree);
                screen.append(box);
            }
            screen.render();
        });
        console.timeEnd('screenKeyBindingToggle');

        console.time('screenRender');
        screen.render();
        console.timeEnd('screenRender');
        console.log('[SCREEN] Screen rendered.');
        function createBox(content) {
            const box = blessed.box({
                top: 1,
                left: 'left',
                width: '100%',
                height: '89%',
                content,
                tags: true,
                scrollable: true,
                alwaysScroll: true,
                scrollbar: {
                    ch: ' ',
                    track: {
                        bg: 'yellow'
                    },
                    style: {
                        inverse: true
                    }
                },
                keys: true, 
                mouse: true 
            });
        

            box.key(['up', 'down', 'left', 'right', 'pageup', 'pagedown', 'home', 'end'], function(ch, key) {
                box.scroll(ch);
                screen.render();
            });
        

            box.on('mouse', function(event) {
                if (event.action === 'wheelup' || event.action === 'wheeldown') {
                    box.scroll(event.action === 'wheelup' ? -1 : 1);
                    screen.render();
                }
            });
        
            return box;
        }
        

        console.timeEnd('main');
    }

    main();
})();
