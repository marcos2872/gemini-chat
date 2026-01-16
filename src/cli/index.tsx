import React from 'react';
import { render } from 'ink';
import { App } from './ui/App';
import meow from 'meow';

const cli = meow(
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

render(<App name={cli.flags.name} />);
