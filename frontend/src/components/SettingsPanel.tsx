import { useAIStore } from '../store/aiStore';
import { useState, useEffect, useCallback } from 'react';
import type { AIProvider } from '../types/project';
import { useEditorStore } from '../store/editorStore';
import { Bot, Cloud, Brain, RefreshCw, Route, ShieldCheck, Copy, CheckCircle2, AlertCircle, Download, ExternalLink, MonitorCheck } from 'lucide-react';
import { RELEASE_LINKS, SCRIPTCUT_VERSION } from '../utils/releaseInfo';

const AI_PROVIDERS: AIProvider[] = ['ollama', 'openai', 'claude', '9router'];

const providerLabels: Record<AIProvider, string> = {
  ollama: 'Ollama',
  openai: 'OpenAI',
  claude: 'Claude',
  '9router': '9router',
};

export default function SettingsPanel() {
  const { providers, defaultProvider, setProviderConfig, setDefaultProvider } = useAIStore();
  const { backendUrl } = useEditorStore();
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [nineRouterModels, setNineRouterModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingNineRouterModels, setLoadingNineRouterModels] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [nineRouterStatus, setNineRouterStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [copiedCommand, setCopiedCommand] = useState('');

  const fetchOllamaModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const baseUrl = providers.ollama.baseUrl || 'http://localhost:11434';
      const query = new URLSearchParams({ base_url: baseUrl });
      const [modelsRes, statusRes] = await Promise.all([
        fetch(`${backendUrl}/ai/ollama-models?${query.toString()}`),
        fetch(`${backendUrl}/ai/ollama-status?${query.toString()}`),
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setOllamaStatus({ ok: !!statusData.ok, message: statusData.message || '' });
      } else {
        setOllamaStatus({ ok: false, message: 'Could not reach Ollama status endpoint.' });
      }

      if (modelsRes.ok) {
        const data = await modelsRes.json();
        setOllamaModels(data.models || []);
      } else {
        setOllamaModels([]);
      }
    } catch {
      setOllamaModels([]);
      setOllamaStatus({ ok: false, message: 'Could not connect to the configured Ollama URL.' });
    } finally {
      setLoadingModels(false);
    }
  }, [backendUrl, providers.ollama.baseUrl]);

  useEffect(() => {
    fetchOllamaModels();
  }, [fetchOllamaModels]);

  const fetchNineRouterModels = useCallback(async () => {
    setLoadingNineRouterModels(true);
    try {
      const config = providers['9router'];
      const res = await fetch(`${backendUrl}/ai/9router-models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_url: config.baseUrl || 'http://localhost:20128/v1',
          api_key: config.apiKey || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.detail || 'Could not load 9router models.');
      }

      const data = await res.json();
      const models = data.models || [];
      setNineRouterModels(models);
      setNineRouterStatus({
        ok: models.length > 0,
        message: models.length > 0 ? `Loaded ${models.length} 9router models.` : '9router returned no models.',
      });
    } catch (err) {
      setNineRouterModels([]);
      setNineRouterStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Could not load 9router models.',
      });
    } finally {
      setLoadingNineRouterModels(false);
    }
  }, [backendUrl, providers]);

  useEffect(() => {
    fetchNineRouterModels();
  }, [fetchNineRouterModels]);

  const providerIcons: Record<AIProvider, React.ReactNode> = {
    ollama: <Bot className="w-4 h-4" />,
    openai: <Cloud className="w-4 h-4" />,
    claude: <Brain className="w-4 h-4" />,
    '9router': <Route className="w-4 h-4" />,
  };

  const providerStatus: Record<AIProvider, { ok: boolean; label: string; local: boolean }> = {
    ollama: {
      ok: !!ollamaStatus?.ok,
      label: ollamaStatus?.ok ? 'Local ready' : 'Local offline',
      local: true,
    },
    openai: {
      ok: !!providers.openai.apiKey,
      label: providers.openai.apiKey ? 'Key saved' : 'Needs key',
      local: false,
    },
    claude: {
      ok: !!providers.claude.apiKey,
      label: providers.claude.apiKey ? 'Key saved' : 'Needs key',
      local: false,
    },
    '9router': {
      ok: !!nineRouterStatus?.ok,
      label: nineRouterStatus?.ok
        ? isLocalUrl(providers['9router'].baseUrl || '')
          ? 'Local route ready'
          : 'Remote route ready'
        : 'Route not verified',
      local: isLocalUrl(providers['9router'].baseUrl || ''),
    },
  };
  const activeStatus = providerStatus[defaultProvider];

  const copyCommand = useCallback(async (command: string) => {
    await navigator.clipboard?.writeText(command);
    setCopiedCommand(command);
    window.setTimeout(() => setCopiedCommand(''), 1500);
  }, []);

  return (
    <div className="p-4 space-y-6">
      <h3 className="text-sm font-semibold">AI Settings</h3>

      <div className="space-y-3 rounded-lg border border-editor-border bg-editor-surface p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium">
              <MonitorCheck className="w-4 h-4 text-editor-accent" />
              ScriptCut desktop
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-editor-text-muted">
              Version {SCRIPTCUT_VERSION}. Desktop releases are the recommended user path because they provide native file access, autosave, and bundled export tools.
            </p>
          </div>
          <span className="rounded bg-editor-bg px-2 py-1 text-[10px] text-editor-text-muted">
            {window.electronAPI ? 'Desktop' : 'Browser'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ReleaseLink href={RELEASE_LINKS.latestRelease} icon={<Download className="h-3.5 w-3.5" />} label="Latest release" />
          <ReleaseLink href={RELEASE_LINKS.installGuide} icon={<ExternalLink className="h-3.5 w-3.5" />} label="Install guide" />
          <ReleaseLink href={RELEASE_LINKS.troubleshooting} icon={<ExternalLink className="h-3.5 w-3.5" />} label="Fix setup" />
          <ReleaseLink href={RELEASE_LINKS.issues} icon={<ExternalLink className="h-3.5 w-3.5" />} label="Report issue" />
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-editor-border bg-editor-surface p-3">
        <div className="flex items-center gap-2 text-xs font-medium">
          <ShieldCheck className="w-4 h-4 text-editor-success" />
          Local-first privacy
        </div>
        <p className="text-[11px] leading-relaxed text-editor-text-muted">
          Media files, project files, waveform data, and exports stay on this machine. Transcript
          text is sent only when you run AI actions with a cloud provider. Ollama and 9router can
          run against local endpoints.
        </p>
      </div>

      {/* Default provider selector */}
      <div className="space-y-2">
        <label className="text-xs text-editor-text-muted font-medium">Default AI Provider</label>
        <div className="grid grid-cols-4 gap-1.5">
          {AI_PROVIDERS.map((p) => (
            <button
              key={p}
              onClick={() => setDefaultProvider(p)}
              title={providerStatus[p].label}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors text-[10px] ${
                defaultProvider === p
                  ? 'border-editor-accent bg-editor-accent/10 text-editor-accent'
                  : 'border-editor-border text-editor-text-muted hover:text-editor-text'
              }`}
            >
              {providerIcons[p]}
              {providerLabels[p]}
              <span className={`flex items-center gap-1 ${providerStatus[p].ok ? 'text-editor-success' : 'text-editor-warning'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${providerStatus[p].ok ? 'bg-editor-success' : 'bg-editor-warning'}`} />
                {providerStatus[p].local ? 'Local' : 'Cloud'}
              </span>
            </button>
          ))}
        </div>
        <div
          className={`rounded border px-3 py-2 text-[11px] ${
            activeStatus.ok
              ? 'border-editor-success/30 bg-editor-success/10 text-editor-success'
              : 'border-editor-warning/30 bg-editor-warning/10 text-editor-warning'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">
              {providerLabels[defaultProvider]}: {activeStatus.label}
            </span>
            <span>{activeStatus.local ? 'Local endpoint' : 'Cloud endpoint'}</span>
          </div>
          <p className="mt-1 leading-relaxed text-editor-text-muted">
            {activeStatus.local
              ? 'AI transcript actions stay on your configured local endpoint when this provider is selected.'
              : 'AI transcript actions send transcript text to the selected cloud provider when this provider is selected.'}
          </p>
        </div>
      </div>

      {/* Ollama settings */}
      <ProviderSection title="Ollama (Local)" icon={providerIcons.ollama}>
        <ProviderNote>Runs through your configured local Ollama server.</ProviderNote>
        <InputField
          label="Base URL"
          value={providers.ollama.baseUrl || ''}
          onChange={(v) => setProviderConfig('ollama', { baseUrl: v })}
          placeholder="http://localhost:11434"
        />
        {ollamaStatus && (
          <p className={`text-[11px] ${ollamaStatus.ok ? 'text-editor-success' : 'text-editor-warning'}`}>
            {ollamaStatus.message}
          </p>
        )}
        {!ollamaStatus?.ok && (
          <SetupCommands
            commands={[
              'ollama serve',
              `ollama pull ${providers.ollama.model || 'llama3'}`,
            ]}
            copiedCommand={copiedCommand}
            onCopy={copyCommand}
          />
        )}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-editor-text-muted">Model</label>
            <button
              onClick={fetchOllamaModels}
              disabled={loadingModels}
              className="text-[10px] text-editor-accent hover:underline flex items-center gap-0.5"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${loadingModels ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          {ollamaModels.length > 0 ? (
            <select
              value={providers.ollama.model}
              onChange={(e) => setProviderConfig('ollama', { model: e.target.value })}
              className="w-full px-3 py-2 bg-editor-surface border border-editor-border rounded-lg text-xs text-editor-text focus:outline-none focus:border-editor-accent"
            >
              {ollamaModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <>
              <InputField
                label=""
                value={providers.ollama.model}
                onChange={(v) => setProviderConfig('ollama', { model: v })}
                placeholder="llama3"
              />
              {ollamaStatus?.ok && (
                <SetupCommands
                  commands={[`ollama pull ${providers.ollama.model || 'llama3'}`]}
                  copiedCommand={copiedCommand}
                  onCopy={copyCommand}
                />
              )}
            </>
          )}
        </div>
      </ProviderSection>

      {/* OpenAI settings */}
      <ProviderSection title="OpenAI" icon={providerIcons.openai}>
        <ProviderNote>AI actions send transcript text to OpenAI when this provider is selected.</ProviderNote>
        <InputField
          label="API Key"
          value={providers.openai.apiKey || ''}
          onChange={(v) => setProviderConfig('openai', { apiKey: v })}
          placeholder="sk-..."
          type="password"
        />
        <InputField
          label="Model"
          value={providers.openai.model}
          onChange={(v) => setProviderConfig('openai', { model: v })}
          placeholder="gpt-4o"
        />
      </ProviderSection>

      {/* Claude settings */}
      <ProviderSection title="Claude (Anthropic)" icon={providerIcons.claude}>
        <ProviderNote>AI actions send transcript text to Anthropic when this provider is selected.</ProviderNote>
        <InputField
          label="API Key"
          value={providers.claude.apiKey || ''}
          onChange={(v) => setProviderConfig('claude', { apiKey: v })}
          placeholder="sk-ant-..."
          type="password"
        />
        <InputField
          label="Model"
          value={providers.claude.model}
          onChange={(v) => setProviderConfig('claude', { model: v })}
          placeholder="claude-sonnet-4-20250514"
        />
      </ProviderSection>

      {/* 9router settings */}
      <ProviderSection title="9router" icon={providerIcons['9router']}>
        <ProviderNote>Uses the configured 9router-compatible endpoint; local endpoints keep traffic local.</ProviderNote>
        <InputField
          label="Base URL"
          value={providers['9router'].baseUrl || ''}
          onChange={(v) => setProviderConfig('9router', { baseUrl: v })}
          placeholder="http://localhost:20128/v1"
        />
        <InputField
          label="API Key"
          value={providers['9router'].apiKey || ''}
          onChange={(v) => setProviderConfig('9router', { apiKey: v })}
          placeholder="sk-..."
          type="password"
        />
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-editor-text-muted">Model</label>
            <button
              onClick={fetchNineRouterModels}
              disabled={loadingNineRouterModels}
              className="text-[10px] text-editor-accent hover:underline flex items-center gap-0.5"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${loadingNineRouterModels ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          {nineRouterStatus && (
            <p className={`text-[11px] ${nineRouterStatus.ok ? 'text-editor-success' : 'text-editor-warning'}`}>
              {nineRouterStatus.message}
            </p>
          )}
          {nineRouterModels.length > 0 && (
            <select
              value={nineRouterModels.includes(providers['9router'].model) ? providers['9router'].model : ''}
              onChange={(e) => {
                if (e.target.value) setProviderConfig('9router', { model: e.target.value });
              }}
              className="w-full px-3 py-2 bg-editor-surface border border-editor-border rounded-lg text-xs text-editor-text focus:outline-none focus:border-editor-accent"
            >
              <option value="">Custom model</option>
              {nineRouterModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          <InputField
            label={nineRouterModels.length > 0 ? 'Custom Model' : ''}
            value={providers['9router'].model}
            onChange={(v) => setProviderConfig('9router', { model: v })}
            placeholder="gpt-4o"
          />
        </div>
      </ProviderSection>
    </div>
  );
}

function ReleaseLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded border border-editor-border bg-editor-bg px-2 py-1.5 text-[11px] text-editor-text-muted hover:text-editor-text"
    >
      {icon}
      <span className="truncate">{label}</span>
    </a>
  );
}

function ProviderNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-relaxed text-editor-text-muted">{children}</p>;
}

function SetupCommands({
  commands,
  copiedCommand,
  onCopy,
}: {
  commands: string[];
  copiedCommand: string;
  onCopy: (command: string) => void;
}) {
  return (
    <div className="space-y-1 rounded border border-editor-border bg-editor-bg p-2">
      <div className="flex items-center gap-1 text-[10px] font-medium text-editor-text-muted">
        <AlertCircle className="h-3 w-3 text-editor-warning" />
        Local setup
      </div>
      {commands.map((command) => (
        <button
          key={command}
          onClick={() => onCopy(command)}
          className="flex w-full items-center justify-between gap-2 rounded bg-editor-surface px-2 py-1 text-left font-mono text-[10px] text-editor-text-muted hover:text-editor-text"
        >
          <span className="truncate">{command}</span>
          {copiedCommand === command ? (
            <CheckCircle2 className="h-3 w-3 shrink-0 text-editor-success" />
          ) : (
            <Copy className="h-3 w-3 shrink-0" />
          )}
        </button>
      ))}
    </div>
  );
}

function isLocalUrl(url: string) {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(url.trim());
}

function ProviderSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 p-3 bg-editor-surface rounded-lg">
      <div className="flex items-center gap-2 text-xs font-medium">
        {icon}
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      {label && <label className="text-xs text-editor-text-muted">{label}</label>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-editor-bg border border-editor-border rounded-lg text-xs text-editor-text placeholder:text-editor-text-muted/50 focus:outline-none focus:border-editor-accent"
      />
    </div>
  );
}
