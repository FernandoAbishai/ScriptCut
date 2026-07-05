import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AIProvider, AIProviderConfig, FillerWordResult, ClipSuggestion, ClipDraft, ProjectAIWorkspace, FillerReviewDecision, EditPlanResult, EditPlanReviewDecision } from '../types/project';

const ENCRYPTED_KEY_PREFIX = 'scriptcut_enc_';
const LEGACY_ENCRYPTED_KEY_PREFIX = 'aive_enc_';
const SETTINGS_STORAGE_KEY = 'scriptcut-ai-settings';
const LEGACY_SETTINGS_STORAGE_KEY = 'aive-ai-settings';

if (
  typeof localStorage !== 'undefined' &&
  !localStorage.getItem(SETTINGS_STORAGE_KEY) &&
  localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY)
) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY) || '');
}

const DEFAULT_PROVIDERS: Record<AIProvider, AIProviderConfig> = {
  ollama: { provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'llama3' },
  openai: { provider: 'openai', apiKey: '', model: 'gpt-4o' },
  claude: { provider: 'claude', apiKey: '', model: 'claude-sonnet-4-20250514' },
  '9router': { provider: '9router', apiKey: '', baseUrl: 'http://localhost:20128/v1', model: 'gpt-4o' },
};

interface AIState {
  providers: Record<AIProvider, AIProviderConfig>;
  defaultProvider: AIProvider;
  customFillerWords: string;
  fillerResult: FillerWordResult | null;
  fillerDecisions: Record<number, FillerReviewDecision>;
  editPlanInstruction: string;
  editPlanResult: EditPlanResult | null;
  editPlanDecisions: Record<string, EditPlanReviewDecision>;
  clipSuggestions: ClipSuggestion[];
  clipDrafts: ClipDraft[];
  isProcessing: boolean;
  processingMessage: string;
  _keysHydrated: boolean;
}

interface AIActions {
  setProviderConfig: (provider: AIProvider, config: Partial<AIProviderConfig>) => void;
  setDefaultProvider: (provider: AIProvider) => void;
  setCustomFillerWords: (words: string) => void;
  setFillerResult: (result: FillerWordResult | null) => void;
  setFillerDecisions: (
    decisions:
      | Record<number, FillerReviewDecision>
      | ((current: Record<number, FillerReviewDecision>) => Record<number, FillerReviewDecision>),
  ) => void;
  setEditPlanInstruction: (instruction: string) => void;
  setEditPlanResult: (result: EditPlanResult | null) => void;
  setEditPlanDecisions: (
    decisions:
      | Record<string, EditPlanReviewDecision>
      | ((current: Record<string, EditPlanReviewDecision>) => Record<string, EditPlanReviewDecision>),
  ) => void;
  setClipSuggestions: (suggestions: ClipSuggestion[]) => void;
  setClipDrafts: (drafts: ClipDraft[] | ((current: ClipDraft[]) => ClipDraft[])) => void;
  setProcessing: (active: boolean, message?: string) => void;
  loadProjectAIState: (workspace?: ProjectAIWorkspace) => void;
  hydrateKeys: () => Promise<void>;
}

async function encryptAndStore(key: string, value: string): Promise<void> {
  if (!value) {
    localStorage.removeItem(ENCRYPTED_KEY_PREFIX + key);
    return;
  }
  if (window.electronAPI) {
    const encrypted = await window.electronAPI.encryptString(value);
    localStorage.setItem(ENCRYPTED_KEY_PREFIX + key, encrypted);
  } else {
    localStorage.setItem(ENCRYPTED_KEY_PREFIX + key, btoa(value));
  }
}

async function loadAndDecrypt(key: string): Promise<string> {
  const stored =
    localStorage.getItem(ENCRYPTED_KEY_PREFIX + key) ||
    localStorage.getItem(LEGACY_ENCRYPTED_KEY_PREFIX + key);
  if (!stored) return '';
  if (window.electronAPI) {
    try {
      return await window.electronAPI.decryptString(stored);
    } catch {
      return '';
    }
  }
  try {
    return atob(stored);
  } catch {
    return '';
  }
}

export const useAIStore = create<AIState & AIActions>()(
  persist(
    (set, get) => ({
      providers: DEFAULT_PROVIDERS,
      defaultProvider: 'ollama',
      customFillerWords: '',
      fillerResult: null,
      fillerDecisions: {},
      editPlanInstruction: '',
      editPlanResult: null,
      editPlanDecisions: {},
      clipSuggestions: [],
      clipDrafts: [],
      isProcessing: false,
      processingMessage: '',
      _keysHydrated: false,

      setProviderConfig: (provider, config) => {
        set((state) => ({
          providers: {
            ...state.providers,
            [provider]: { ...state.providers[provider], ...config },
          },
        }));

        if (config.apiKey !== undefined) {
          encryptAndStore(`${provider}_apiKey`, config.apiKey);
        }
      },

      setDefaultProvider: (provider) => set({ defaultProvider: provider }),

      setCustomFillerWords: (words) => set({ customFillerWords: words }),

      setFillerResult: (result) => set({ fillerResult: result, fillerDecisions: {} }),

      setFillerDecisions: (decisions) =>
        set((state) => ({
          fillerDecisions:
            typeof decisions === 'function' ? decisions(state.fillerDecisions) : decisions,
        })),

      setEditPlanInstruction: (instruction) => set({ editPlanInstruction: instruction }),

      setEditPlanResult: (result) => set({ editPlanResult: result, editPlanDecisions: {} }),

      setEditPlanDecisions: (decisions) =>
        set((state) => ({
          editPlanDecisions:
            typeof decisions === 'function' ? decisions(state.editPlanDecisions) : decisions,
        })),

      setClipSuggestions: (suggestions) => set({ clipSuggestions: suggestions }),

      setClipDrafts: (drafts) =>
        set((state) => ({
          clipDrafts: typeof drafts === 'function' ? drafts(state.clipDrafts) : drafts,
        })),

      setProcessing: (active, message) =>
        set({ isProcessing: active, processingMessage: message ?? '' }),

      loadProjectAIState: (workspace) =>
        set({
          customFillerWords: workspace?.customFillerWords ?? get().customFillerWords,
          fillerResult: workspace?.fillerResult ?? null,
          fillerDecisions: workspace?.fillerDecisions ?? {},
          editPlanInstruction: workspace?.editPlanInstruction ?? '',
          editPlanResult: workspace?.editPlanResult ?? null,
          editPlanDecisions: workspace?.editPlanDecisions ?? {},
          clipSuggestions: workspace?.clipSuggestions ?? [],
          clipDrafts: workspace?.clipDrafts ?? [],
          isProcessing: false,
          processingMessage: '',
        }),

      hydrateKeys: async () => {
        const [openaiKey, claudeKey, routerKey] = await Promise.all([
          loadAndDecrypt('openai_apiKey'),
          loadAndDecrypt('claude_apiKey'),
          loadAndDecrypt('9router_apiKey'),
        ]);
        const state = get();
        set({
          providers: {
            ...state.providers,
            openai: { ...state.providers.openai, apiKey: openaiKey },
            claude: { ...state.providers.claude, apiKey: claudeKey },
            '9router': { ...state.providers['9router'], apiKey: routerKey },
          },
          _keysHydrated: true,
        });
      },
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      partialize: (state) => ({
        providers: {
          ollama: { ...state.providers.ollama, apiKey: undefined },
          openai: { ...state.providers.openai, apiKey: '' },
          claude: { ...state.providers.claude, apiKey: '' },
          '9router': { ...state.providers['9router'], apiKey: '' },
        },
        defaultProvider: state.defaultProvider,
        customFillerWords: state.customFillerWords,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<AIState> | undefined;
        return {
          ...current,
          ...persistedState,
          providers: {
            ...DEFAULT_PROVIDERS,
            ...persistedState?.providers,
          },
        };
      },
    },
  ),
);

useAIStore.getState().hydrateKeys();
