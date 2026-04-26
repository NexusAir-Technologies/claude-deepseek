import React from 'react';
import { Box, Text } from 'src/ink.js';

const WELCOME_V2_WIDTH = 58;
//const FOOT_DIVIDER = '…………………▓▓   ▓▓…………………………………………………………………………';

const FOOT_DIVIDER = '………………………………………………………………………………………………………………';

const CLAUDE_WELCOME_ART = [
  '                                                          ',
  '     *                                      █████▓▓░      ',
  '                                *         ███▓░     ░░    ',
  '            ░░░░░░                       ███▓░            ',
  '    ░░░   ░░░░░░░░░░                     ███▓░            ',
  '   ░░░░░░░░░░░░░░░░░░░    *               ██▓░░      ▓    ',
  '                                            ░▓▓███▓▓░     ',
  '        █ █                      ░░░░                   ',
  '         █                     ░░░░░░░░                 ',
  '       ▓▓▓▓▓  ▓▓ ▓            ░░░░░░░░░░░░░░░░   *       ',
  '      ▓▓▓▓▓▓▓ ▓▓▓▓                                        ',
  '     ▓▓▓▓▓▓▓▓▓  ▓                         *              ',
  '     ▓▓▓▓▓▓▓░▓  ▓                                         ',
  '     █████▓▓▓▓▓▓▓      *                                  ',
  '     ██████▓▓▓▓▓▓                                         ',
  '      ██████▓▓▓▓                           *              ',
];

export function WelcomeV2(): React.ReactNode {
  return (
    <Box width={WELCOME_V2_WIDTH} flexDirection="column">
      <Text><Text color="permission">Welcome to Claude Code </Text><Text dimColor={true}>v{MACRO.VERSION}</Text></Text>
      {CLAUDE_WELCOME_ART.map((line, index) => (
        <Text key={index}>{line.slice(0, WELCOME_V2_WIDTH)}</Text>
      ))}
      <Text dimColor={true}>{FOOT_DIVIDER.slice(0, WELCOME_V2_WIDTH)}</Text>
    </Box>
  );
}
