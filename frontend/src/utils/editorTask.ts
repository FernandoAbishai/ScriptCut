export type EditorWorkflow = 'full-video' | 'short' | 'project';
export type EditorPanel = 'ai' | 'export' | 'settings' | null;

export type EditorTaskInput = {
  workflow: EditorWorkflow;
  isTranscribing: boolean;
  hasTranscriptionError: boolean;
  wordCount: number;
  cutCount: number;
  layerCount: number;
  activePanel: EditorPanel;
};

export type EditorTaskPresentation = {
  workflowLabel: string;
  title: string;
  description: string;
  status: string;
};

export function getPostTranscriptionPanel(workflow: EditorWorkflow | null | undefined): EditorPanel {
  return workflow === 'short' ? 'ai' : null;
}

export function getEditorTaskPresentation(input: EditorTaskInput): EditorTaskPresentation {
  const workflowLabel = getWorkflowLabel(input.workflow);

  if (input.isTranscribing) {
    return {
      workflowLabel,
      title: 'Preparing your transcript',
      description: 'ScriptCut is transcribing your media locally.',
      status: 'In progress',
    };
  }

  if (input.hasTranscriptionError) {
    return {
      workflowLabel,
      title: 'Transcription needs attention',
      description: 'Review the recovery options below to try again or choose another setup.',
      status: 'Action needed',
    };
  }

  if (input.activePanel === 'ai') {
    return {
      workflowLabel,
      title: input.workflow === 'short' ? 'Create Clips' : 'AI tools',
      description:
        input.workflow === 'short'
          ? 'Find, review, prepare, and export moments from your recording.'
          : 'Optional assistance for edits, filler words, and clips.',
      status: 'Optional',
    };
  }

  if (input.activePanel === 'export') {
    return {
      workflowLabel,
      title: 'Export',
      description: 'Review your output settings and export when you’re ready.',
      status: 'Tool open',
    };
  }

  if (input.activePanel === 'settings') {
    return {
      workflowLabel,
      title: 'Settings',
      description: 'Adjust ScriptCut preferences and advanced configuration.',
      status: 'Tool open',
    };
  }

  if (input.wordCount === 0) {
    return {
      workflowLabel,
      title: 'Waiting for transcript',
      description: 'Your transcript will appear here when it is ready.',
      status: 'Waiting',
    };
  }

  const hasEdits = input.cutCount > 0 || input.layerCount > 0;
  if (input.workflow === 'full-video') {
    return hasEdits
      ? {
          workflowLabel,
          title: 'Review your changes',
          description: 'Preview the edited playback, continue editing, or export when you’re ready.',
          status: 'In progress',
        }
      : {
          workflowLabel,
          title: 'Transcript ready',
          description: 'Edit the transcript to cut your video. Select words for more actions.',
          status: 'Ready to edit',
        };
  }

  if (input.workflow === 'short') {
    return hasEdits
      ? {
          workflowLabel,
          title: 'Prepare your clips',
          description: 'Continue reviewing the transcript or open AI tools to find and prepare moments.',
          status: 'In progress',
        }
      : {
          workflowLabel,
          title: 'Transcript ready',
          description: 'Review the transcript, draft a clip from a selection, or use AI tools to find moments.',
          status: 'Ready to review',
        };
  }

  return hasEdits
    ? {
        workflowLabel,
        title: 'Review your project',
        description: 'Continue editing your transcript or open a tool when needed.',
        status: 'In progress',
      }
    : {
        workflowLabel,
        title: 'Project ready',
        description: 'Continue editing your transcript or open a tool when needed.',
        status: 'Ready to continue',
      };
}

function getWorkflowLabel(workflow: EditorWorkflow): string {
  return workflow === 'full-video' ? 'Edit a Video' : workflow === 'short' ? 'Create Clips' : 'Project';
}
