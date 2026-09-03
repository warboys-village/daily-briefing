#!/usr/bin/env node
const { spawn } = require('child_process');

let place = process.env.VILLAGE_PLACE;
const args = process.argv.slice(2);
const remainingArgs = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--place' || arg === '-p') {
    place = args[++i];
  } else if (arg.startsWith('--place=')) {
    place = arg.split('=')[1];
  } else if (arg.toLowerCase() === 'warboys' || arg.toLowerCase() === 'ramsey') {
    place = arg;
  } else {
    remainingArgs.push(arg);
  }
}

place = (place || 'warboys').toLowerCase();
process.env.VILLAGE_PLACE = place;

const defaultPort = place === 'ramsey' ? '8081' : '8080';
const eleventyArgs = ['--serve'];

if (!remainingArgs.some(a => a.startsWith('--port'))) {
  eleventyArgs.push(`--port=${defaultPort}`);
}

eleventyArgs.push(...remainingArgs);

console.log(`[Dev Server] Starting development server for: ${place.toUpperCase()} on port ${defaultPort}...`);
console.log(` -> Run "npm run dev ramsey" or "npm run dev warboys" to switch sites.`);

const child = spawn('npx', ['@11ty/eleventy', ...eleventyArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VILLAGE_PLACE: place
  },
  shell: true
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
