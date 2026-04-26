import * as React from 'react';
import { Box, Text } from '../../ink.js';

export type ClawdPose = 'default' | 'arms-up' | 'look-left' | 'look-right';

type Props = {
  pose?: ClawdPose;
};

const DEEPSEEK_CLAWD = [
  '    █ █         ',
  '     █          ',
  '   ▓▓▓▓▓  ▓▓ ▓ ',
  '  ▓▓▓▓▓▓▓ ▓▓▓▓ ',
  ' ▓▓▓▓▓▓▓▓▓  ▓ ',
  ' ▓▓▓▓▓▓▓░▓  ▓ ',
  ' █████▓▓▓▓▓▓▓ ',
  ' ██████▓▓▓▓▓▓ ',
  '  ██████▓▓▓▓  ',
];

export function Clawd({ pose = 'default' }: Props = {}): React.ReactNode {
  const lines = pose === 'arms-up'
    ? DEEPSEEK_CLAWD.map((line, index) => (index === 0 ? ` ▓ ${line.slice(3)}` : line))
    : DEEPSEEK_CLAWD;

  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <Text key={index} color="permission">{line}</Text>
      ))}
    </Box>
  );
}
