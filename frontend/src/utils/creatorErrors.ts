export type CreatorErrorContext =
  | 'project-load'
  | 'project-save'
  | 'recent-project'
  | 'recovery'
  | 'media-upload'
  | 'setup'
  | 'ai-action'
  | 'clip-action'
  | 'clipboard';

export type CreatorErrorPresentation = {
  tone: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  technicalDetails: string;
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function getCreatorErrorPresentation(context: CreatorErrorContext, error: unknown): CreatorErrorPresentation {
  const technicalDetails = errorText(error);
  const normalized = technicalDetails.toLowerCase();

  if (context === 'ai-action') {
    if (/api key|apikey|authentication|unauthorized|\b401\b|\b403\b|credential/.test(normalized)) {
      return { tone: 'error', title: 'AI needs configuration', message: 'Check the selected provider in Settings, then try again.', technicalDetails };
    }
    if (/network|fetch failed|econnrefused|unreachable|timeout|could not reach|not available/.test(normalized)) {
      return { tone: 'error', title: 'AI provider couldn’t be reached', message: 'Check your AI configuration or try again.', technicalDetails };
    }
    if (/rate limit|too many|\b429\b|busy|overload|temporar/.test(normalized)) {
      return { tone: 'warning', title: 'AI provider is busy', message: 'Try again shortly.', technicalDetails };
    }
    if (/cancel/.test(normalized)) {
      return { tone: 'info', title: 'Action canceled', message: 'No changes were applied.', technicalDetails };
    }
    return { tone: 'error', title: 'AI couldn’t finish', message: 'Try again. Technical details are available below.', technicalDetails };
  }

  if (context === 'project-load') {
    return { tone: 'error', title: 'Project couldn’t open', message: 'Check the project file and try again.', technicalDetails };
  }
  if (context === 'project-save') {
    return { tone: 'error', title: 'Project couldn’t save', message: 'Try saving again. Your current edit remains open.', technicalDetails };
  }
  if (context === 'recent-project') {
    return {
      tone: 'warning',
      title: 'Recent project couldn’t open',
      message: 'ScriptCut removed the unavailable entry from Recent projects. Choose another project or open the project again from disk.',
      technicalDetails,
    };
  }
  if (context === 'recovery') {
    return { tone: 'warning', title: 'Saved work couldn’t be restored', message: 'Try another snapshot or dismiss this recovery item.', technicalDetails };
  }
  if (context === 'media-upload') {
    return { tone: 'error', title: 'Media couldn’t open', message: 'ScriptCut couldn’t prepare this file for editing. Try another file or try again.', technicalDetails };
  }
  if (context === 'setup') {
    if (/setup checks? failed|setup checks? could not|system\/checks/.test(normalized)) {
      return { tone: 'error', title: 'Setup checks couldn’t finish', message: 'Try refreshing the setup check. Technical details are available below.', technicalDetails };
    }
    return { tone: 'error', title: 'ScriptCut couldn’t start its editing service', message: 'Open Setup Check to see what needs attention, then restart ScriptCut.', technicalDetails };
  }
  if (context === 'clip-action') {
    return { tone: 'error', title: 'Clip export couldn’t finish', message: 'Try the export again. Your clip draft is still available.', technicalDetails };
  }
  if (context === 'clipboard') {
    return { tone: 'error', title: 'Could not copy', message: 'Try copying again.', technicalDetails };
  }
  return { tone: 'error', title: 'Could not complete that action', message: 'Try again.', technicalDetails };
}
