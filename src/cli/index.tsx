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

// @ts-ignore
const app = render(<App />, { altScreen: true });
log.info('###### Application started ######');

await app.waitUntilExit();
