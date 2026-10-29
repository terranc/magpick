import React, { useCallback, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { AgentType, ModelEntry } from '../types.js';

const PAGE_SIZE = 10;

interface AppProps {
  agent: AgentType;
  gatewayUrl: string;
  models: ModelEntry[];
  onSelect: (model: ModelEntry) => void;
}

export function App({ agent, gatewayUrl, models, onSelect }: AppProps) {
  const { exit } = useApp();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredModels = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return models;
    }

    return models.filter((model) => {
      const haystack =
        `${model.id}\n${model.displayName}\n${model.provider}\n${model.label}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [models, query]);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const safeIndex =
    filteredModels.length === 0
      ? 0
      : Math.min(selectedIndex, filteredModels.length - 1);
  const selectedModel = filteredModels[safeIndex];

  const startIndex = Math.floor(safeIndex / PAGE_SIZE) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, filteredModels.length);
  const visibleModels = filteredModels.slice(startIndex, endIndex);

  const handleSelect = useCallback(
    (model: ModelEntry) => {
      onSelect(model);
      exit();
    },
    [onSelect, exit]
  );

  useInput(
    useCallback(
      (input, key) => {
        if (key.upArrow) {
          setSelectedIndex((previous) =>
            previous > 0 ? previous - 1 : Math.max(0, filteredModels.length - 1)
          );
        } else if (key.downArrow) {
          setSelectedIndex((previous) =>
            previous < filteredModels.length - 1 ? previous + 1 : 0
          );
        } else if (key.pageUp) {
          setSelectedIndex((previous) => Math.max(0, previous - PAGE_SIZE));
        } else if (key.pageDown) {
          setSelectedIndex((previous) =>
            Math.min(Math.max(0, filteredModels.length - 1), previous + PAGE_SIZE)
          );
        } else if (key.return && selectedModel) {
          handleSelect(selectedModel);
        } else if (key.escape) {
          exit();
          process.exit(0);
        }
      },
      [filteredModels.length, selectedModel, handleSelect, exit]
    )
  );

  if (filteredModels.length === 0) {
    return (
      <Box flexDirection="column">
        <SearchHeader query={query} onChange={setQuery} />
        <Text dimColor>No models found matching "{query}".</Text>
      </Box>
    );
  }

  const totalPages = Math.ceil(filteredModels.length / PAGE_SIZE);
  const currentPage = Math.floor(safeIndex / PAGE_SIZE) + 1;

  return (
    <Box flexDirection="column" padding={1}>
      <SearchHeader query={query} onChange={setQuery} />

      <Box marginBottom={1}>
        <Text dimColor>
          {agentLabel(agent)} · {gatewayUrl}
        </Text>
      </Box>

      <Box flexDirection="row">
        <Box flexDirection="column" width="52%">
          {visibleModels.map((model, index) => {
            const globalIndex = startIndex + index;
            const isSelected = globalIndex === safeIndex;
            const badges = protocolBadges(model);

            return (
              <Box key={model.id}>
                <Text
                  bold={isSelected}
                  color={isSelected ? 'green' : undefined}
                  inverse={isSelected}
                  wrap="truncate"
                >
                  {isSelected ? '❯ ' : '  '}
                  {model.isGroup ? '◆ ' : ''}
                  {model.isGroup
                    ? model.displayName
                    : `${model.provider} · ${model.displayName}`}
                  {badges.length > 0 && (
                    <Text color="cyan"> [{badges.join('')}]</Text>
                  )}
                </Text>
              </Box>
            );
          })}
        </Box>

        <Box width="48%">
          <ModelPreview model={selectedModel} gatewayUrl={gatewayUrl} />
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          ↑↓ Navigate │ PgUp/PgDn Page │ Enter Select │ Esc Cancel
        </Text>
        <Text dimColor>M messages · R responses · C chat · G gemini</Text>
        {totalPages > 1 && (
          <Text dimColor>
            Page {currentPage}/{totalPages} ({filteredModels.length} models)
          </Text>
        )}
      </Box>
    </Box>
  );
}

interface SearchHeaderProps {
  query: string;
  onChange: (value: string) => void;
}

function SearchHeader({ query, onChange }: SearchHeaderProps) {
  return (
    <Box marginBottom={1}>
      <Text bold color="cyan">
        🔍 Search:{' '}
      </Text>
      <TextInput
        value={query}
        onChange={onChange}
        placeholder="Search model, provider, or id..."
        showCursor={true}
      />
    </Box>
  );
}

interface ModelPreviewProps {
  model: ModelEntry | undefined;
  gatewayUrl: string;
}

function ModelPreview({ model, gatewayUrl }: ModelPreviewProps) {
  if (!model) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>No model selected</Text>
      </Box>
    );
  }

  const native = nativeEndpointNames(model);
  const price = formatPrice(model.pricing);

  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="gray">
      <Text bold color="cyan">
        {model.displayName}
      </Text>
      <Text dimColor>{model.id}</Text>
      <Text dimColor>{'─'.repeat(38)}</Text>

      <Text>
        <Text color="yellow">Provider: </Text>
        {model.provider}
        {model.isGroup ? ' · routing group' : ''}
      </Text>

      <Text>
        <Text color="yellow">Native: </Text>
        {native.length > 0 ? native.join(', ') : 'translated by magpie'}
      </Text>

      {model.contextWindow !== undefined && (
        <Text>
          <Text color="yellow">Context: </Text>
          {formatTokens(model.contextWindow)}
          {model.maxOutputTokens !== undefined
            ? ` · output ${formatTokens(model.maxOutputTokens)}`
            : ''}
        </Text>
      )}

      {model.reasoningLevels.length > 0 && (
        <Text>
          <Text color="yellow">Reasoning: </Text>
          {model.reasoningLevels.join(' / ')}
        </Text>
      )}

      {price && (
        <Text>
          <Text color="yellow">Price: </Text>
          {price}
        </Text>
      )}

      <Box marginTop={1}>
        <Text dimColor>Gateway: {gatewayUrl}</Text>
      </Box>
    </Box>
  );
}

function nativeEndpointNames(model: ModelEntry): string[] {
  const names: string[] = [];

  for (const endpoint of model.nativeEndpoints) {
    if (endpoint === '/v1/messages') {
      names.push('messages');
    } else if (endpoint === '/v1/responses') {
      names.push('responses');
    } else if (endpoint === '/v1/chat/completions') {
      names.push('chat');
    } else if (endpoint.includes('gemini') || endpoint.includes('/v1beta')) {
      names.push('gemini');
    } else {
      names.push(endpoint);
    }
  }

  return names;
}

function protocolBadges(model: ModelEntry): string[] {
  const badges: string[] = [];

  if (model.nativeEndpoints.includes('/v1/messages')) {
    badges.push('M');
  }
  if (model.nativeEndpoints.includes('/v1/responses')) {
    badges.push('R');
  }
  if (model.nativeEndpoints.includes('/v1/chat/completions')) {
    badges.push('C');
  }
  if (
    model.nativeEndpoints.some(
      (endpoint) => endpoint.includes('gemini') || endpoint.includes('/v1beta')
    )
  ) {
    badges.push('G');
  }

  return badges;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${trimZero(millions.toFixed(1))}M`;
  }

  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}K`;
  }

  return String(value);
}

function formatPrice(pricing: Record<string, string> | undefined): string | undefined {
  if (!pricing) {
    return undefined;
  }

  const input = Number(pricing.prompt);
  const output = Number(pricing.completion);

  if (!Number.isFinite(input) || !Number.isFinite(output)) {
    return undefined;
  }

  return `${formatUsd(input * 1_000_000)}/M in · ${formatUsd(output * 1_000_000)}/M out`;
}

function formatUsd(value: number): string {
  return `$${trimZero(value.toFixed(2))}`;
}

function trimZero(value: string): string {
  return value.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function agentLabel(agent: AgentType): string {
  return agent === 'claude' ? 'Claude Code' : 'Codex';
}
