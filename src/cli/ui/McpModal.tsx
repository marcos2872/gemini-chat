import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { MCPServer } from '../../boot/mcp/McpConfigService';
import { exec } from 'child_process';
import * as path from 'path';
import * as os from 'os';

interface McpModalProps {
    servers: MCPServer[];
    onToggle: (name: string) => void;
    onClose: () => void;
}

const CONFIG_PATH = path.join(os.homedir(), '.gemini-desktop', 'settings.json');

export const McpModal = ({ servers, onToggle, onClose }: McpModalProps) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Ensure selected index is always valid
    const safeIndex = servers.length === 0 ? 0 : Math.min(selectedIndex, servers.length - 1);

    const openConfigFile = () => {
        // Try to open with the default editor
        const command =
            process.platform === 'darwin'
                ? `open "${CONFIG_PATH}"`
                : process.platform === 'win32'
                  ? `start "" "${CONFIG_PATH}"`
                  : `xdg-open "${CONFIG_PATH}" || ${process.env.EDITOR || 'nano'} "${CONFIG_PATH}"`;

        exec(command, (error) => {
            if (error) {
                // Fallback: try with common editors
                exec(`code "${CONFIG_PATH}" || nano "${CONFIG_PATH}" || vi "${CONFIG_PATH}"`);
            }
        });
    };

    useInput((input, key) => {
        if (key.escape) {
            onClose();
            return;
        }

        if (input === 'e' || input === 'E') {
            openConfigFile();
            return;
        }

        if (key.upArrow) {
            setSelectedIndex((prev) => Math.max(0, prev - 1));
        } else if (key.downArrow) {
            setSelectedIndex((prev) => Math.min(servers.length - 1, prev + 1));
        } else if (key.return && servers.length > 0) {
            const server = servers[safeIndex];
            if (server) {
                onToggle(server.name);
            }
        }
    });

    return (
        <Box
            flexDirection="column"
            padding={1}
            borderColor="cyan"
            borderStyle="single"
            minWidth={55}
        >
            <Box marginBottom={1} justifyContent="center" width="100%">
                <Text bold underline color="cyan">
                    MCP Servers
                </Text>
            </Box>

            {servers.length === 0 ? (
                <Box paddingY={1} flexDirection="column">
                    <Text color="gray">No MCP servers configured.</Text>
                    <Text color="gray" dimColor>
                        Press E to edit config file.
                    </Text>
                </Box>
            ) : (
                <Box flexDirection="column">
                    {servers.map((server, index) => {
                        const isSelected = index === safeIndex;
                        const isEnabled = server.enabled !== false;

                        return (
                            <Box key={server.name}>
                                <Text color={isSelected ? 'cyan' : undefined}>
                                    {isSelected ? '▸ ' : '  '}
                                </Text>
                                <Text color={isEnabled ? 'green' : 'gray'} bold={isSelected}>
                                    [{isEnabled ? '✓' : ' '}]
                                </Text>
                                <Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>
                                    {' '}
                                    {server.name}
                                </Text>
                                <Text color="gray" dimColor>
                                    {' '}
                                    ({server.type || 'stdio'})
                                </Text>
                            </Box>
                        );
                    })}
                </Box>
            )}

            <Box
                marginTop={1}
                borderStyle="single"
                borderColor="gray"
                paddingX={1}
                justifyContent="center"
            >
                <Text color="gray">↑↓ Navigate | Enter Toggle | E Edit | Esc Close</Text>
            </Box>
        </Box>
    );
};
