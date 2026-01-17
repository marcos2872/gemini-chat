import React from 'react';
import { render } from 'ink';
import { App } from './ui/App';
import meow from 'meow';
import { createLogger } from '../boot/lib/logger';
const log = createLogger('CLI');

meow(
    `
	Usage
	  $ ia-chat

	Options
		--name  Your name

	Examples
	  $ ia-chat --name=Jane
	  Hello, Jane
`,
    {
        importMeta: import.meta,
        flags: {
            name: {
                type: 'string',
            },
        },
    },
);

const enterAltScreen = () => process.stdout.write('\x1b[?1049h');
const exitAltScreen = () => process.stdout.write('\x1b[?1049l');

enterAltScreen();

const app = render(<App />);
log.info('###### Application started ######');

app.waitUntilExit().then(() => {
    exitAltScreen();
});
